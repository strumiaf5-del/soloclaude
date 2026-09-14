from __future__ import annotations

import inspect
import logging
import os
import time
import uuid

from fastapi import APIRouter, Depends, BackgroundTasks, UploadFile, File, Query, Form, HTTPException
from fastapi.responses import FileResponse
from typing import Optional

logger = logging.getLogger(__name__)


# Cache de parámetros válidos de `process_audio`, computada una sola vez.
# Los endpoints /master y /master/preset arman `params` iterando locals();
# si filtran contra este set, nunca se cuelan free variables del closure
# (como `dependencies` o `router`) que romperían process_audio(**params).
def _load_process_audio_params() -> set:
    try:
        from mastering import process_audio
        return set(inspect.signature(process_audio).parameters)
    except Exception:
        # Fallback: vacío => el loop no agrega nada => params queda solo con
        # output_format/output_bit_depth (comportamiento seguro).
        return set()


_PROCESS_AUDIO_PARAMS = _load_process_audio_params()


async def _run_mastering_sync(
    file: UploadFile,
    params: dict,
    reference_file: Optional[UploadFile] = None,
):
    """Helper común para los endpoints /master/* sync.

    Persiste el (o los) UploadFile a disco dentro de UPLOAD_DIR (no usa /tmp),
    llama a ``process_audio(input_path, **filtered_params)`` con solo kwargs
    válidos según la firma real, y devuelve un ``FileResponse`` con el WAV
    procesado en 24-bit. Limpia los temporales en el ``finally``.
    """
    from mastering import process_audio
    import uuid

    upload_dir = globals().get("UPLOAD_DIR") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
    )
    os.makedirs(upload_dir, exist_ok=True)

    uid = uuid.uuid4().hex
    input_filename = os.path.basename(file.filename or "input.wav") or "input.wav"
    input_path = os.path.join(upload_dir, f"sync_in_{uid}_{input_filename}")
    with open(input_path, "wb") as fh:
        fh.write(await file.read())

    ref_path = None
    if reference_file is not None:
        ref_filename = os.path.basename(reference_file.filename or "reference.wav") or "reference.wav"
        ref_path = os.path.join(upload_dir, f"sync_ref_{uid}_{ref_filename}")
        with open(ref_path, "wb") as fh:
            fh.write(await reference_file.read())
        params = dict(params)
        params["reference"] = {"path": ref_path, "filename": ref_filename}

    try:
        # Filtramos los kwargs contra la firma real para no romper process_audio
        # con keys desconocidas (los presets viejos guardan cosas como 'label').
        valid_keys = _PROCESS_AUDIO_PARAMS
        kwargs = {k: v for k, v in params.items() if k in valid_keys and v is not None}
        result = process_audio(input_path, **kwargs)
        output_path = result["output_path"] if isinstance(result, dict) else result

        # Calcular métricas del WAV procesado para setear headers DSP.
        # Best-effort: si measure_lufs falla, igual devolvemos el archivo sin
        # headers (frontend usa el fallback "Procesamiento completado").
        extra_headers: dict = {}
        try:
            import soundfile as _sf
            from mastering import measure_lufs_integrated as _measure_lufs
            _audio, _sr = _sf.read(output_path), _sf.info(output_path).samplerate
            _lufs = _measure_lufs(_audio, _sr)
            if _lufs is not None:
                extra_headers["X-Output-LUFS"] = f"{float(_lufs):.2f}"
        except Exception:
            pass
        # X-Reference-Match solo aplica cuando hay reference_file.
        if reference_file is not None and isinstance(result, dict):
            try:
                _mp = (((result.get("reference_match") or {}).get("after") or {}).get("match_percent"))
                if _mp is not None:
                    extra_headers["X-Reference-Match"] = f"{float(_mp):.2f}"
            except Exception:
                pass

        base, ext = os.path.splitext(input_filename)
        if reference_file is not None:
            out_name = f"matched_{base}{ext or '.wav'}"
        else:
            out_name = f"mastered_{base}{ext or '.wav'}"
        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename=out_name,
            headers=extra_headers,
        )
    finally:
        for p in (input_path, ref_path):
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass


def create_router(**dependencies):
    router: APIRouter = dependencies.get("router", APIRouter())
    get_current_user = dependencies.get("get_current_user")

    # ─── /master/preset/{preset_name} ──────────────────────────────────
    @router.post("/master/preset/{preset_name}", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_with_preset(
        preset_name: str,
        file: UploadFile = File(...),
        platform_target: str = Query(None, description="spotify|youtube|apple_music|tidal|club|cd"),
        output_format: str = Form("wav", pattern="^(wav|flac|mp3)$"),
        output_bit_depth: int = Query(24, description="Bit depth de salida (WAV/FLAC): 16, 24 o 32 (float). Se aplica dither TPDF si baja de 32."),
        mb_low_crossover: float = Query(None, ge=20.0, le=2000.0),
        mb_high_crossover: float = Query(None, ge=500.0, le=20000.0),
        mb_low_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_low_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_low_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_low_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_low_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_mid_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_mid_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_mid_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_mid_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_mid_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_high_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_high_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_high_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_high_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_high_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_bypass: Optional[bool] = Query(None),
        input_gain_db: Optional[float] = Query(None, ge=-24.0, le=24.0),
    ):
        from mastering import get_preset
        try:
            params = get_preset(preset_name)
        except KeyError as e:
            logger.exception("Preset '%s' no encontrado", preset_name)
            raise HTTPException(404, "Preset no encontrado")
        params.pop("label", None)
        params["output_format"] = output_format
        params["output_bit_depth"] = output_bit_depth
        if platform_target:
            params["platform_target"] = platform_target
        for key in ["mb_low_crossover", "mb_high_crossover", "mb_low_threshold_db", "mb_low_ratio",
                    "mb_low_attack_ms", "mb_low_release_ms", "mb_low_makeup_db",
                    "mb_mid_threshold_db", "mb_mid_ratio", "mb_mid_attack_ms", "mb_mid_release_ms",
                    "mb_mid_makeup_db", "mb_high_threshold_db", "mb_high_ratio", "mb_high_attack_ms",
                    "mb_high_release_ms", "mb_high_makeup_db"]:
            val = locals().get(key)
            if val is not None:
                params[key] = val
        if mb_bypass is not None:
            params["mb_bypass"] = mb_bypass
        if input_gain_db is not None:
            params["input_gain_db"] = input_gain_db

        # Sync: ejecutar el mastering ahora y devolver el WAV. Antes este endpoint
        # respondía JSON con job_id (engañoso bajo el nombre /master/preset).
        return await _run_mastering_sync(file, params)

    # ─── /master ──────────────────────────────────────────────────────
    @router.post("/master", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_async(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        platform_target: str = Query(None, description="spotify|youtube|apple_music|tidal|club|cd"),
        output_format: str = Form("wav", pattern="^(wav|flac|mp3)$"),
        output_bit_depth: int = Query(24, description="Bit depth de salida (WAV/FLAC): 16, 24 o 32 (float). Se aplica dither TPDF si baja de 32."),
        loudness_target: Optional[float] = Query(None, ge=-30.0, le=-4.0, description="Si se especifica fija el LUFS de salida a este valor."),
        mb_low_crossover: float = Query(None, ge=20.0, le=2000.0),
        mb_high_crossover: float = Query(None, ge=500.0, le=20000.0),
        mb_low_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_low_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_low_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_low_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_low_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_mid_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_mid_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_mid_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_mid_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_mid_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_high_threshold_db: float = Query(None, ge=-60.0, le=0.0),
        mb_high_ratio: float = Query(None, ge=1.0, le=20.0),
        mb_high_attack_ms: float = Query(None, ge=0.1, le=200.0),
        mb_high_release_ms: float = Query(None, ge=10.0, le=1000.0),
        mb_high_makeup_db: float = Query(None, ge=-12.0, le=24.0),
        mb_bypass: Optional[bool] = Query(None),
        input_gain_db: Optional[float] = Query(None, ge=-24.0, le=24.0),
        headroom_db: float = Query(-1.0, ge=-3.0, le=0.0),
        ceiling_db: float = Query(-0.3, ge=-1.0, le=0.0),
    ):
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth}
        if loudness_target:
            params["loudness_target"] = loudness_target
        if platform_target:
            params["platform_target"] = platform_target
        # Whitelist contra la signature real de process_audio: solo pasamos
        # parámetros que la función acepta. Esto evita que free variables del
        # closure (dependencies, router, get_current_user) contaminen params
        # via locals() y rompan process_audio(**params) con TypeError.
        if _PROCESS_AUDIO_PARAMS:
            for key, val in locals().items():
                if val is not None and key in _PROCESS_AUDIO_PARAMS:
                    params[key] = val
        else:
            # Fallback si la signature no pudo leerse: exclusión explícita
            # de las free variables conocidas del closure.
            for key, val in locals().items():
                if val is not None and key not in (
                    "file", "background_tasks", "platform_target", "output_format",
                    "output_bit_depth", "loudness_target", "params",
                    "dependencies", "router", "get_current_user",
                    "headroom_db", "ceiling_db",
                ):
                    params[key] = val

        jobs = dependencies.get("jobs")
        run_mastering_job = dependencies.get("run_mastering_job")
        upload_dir = dependencies.get("UPLOAD_DIR")
        validate_audio_file_fn = dependencies.get("validate_audio_file")
        read_and_validate_fn = dependencies.get("read_and_validate")

        validate_audio_file_fn(file.filename)
        data = await read_and_validate_fn(file)
        job_id = uuid.uuid4().hex
        input_path = os.path.join(upload_dir, f"{job_id}_{file.filename}")
        with open(input_path, "wb") as fh:
            fh.write(data)

        jobs.create_job(job_id, {
            "status": "queued",
            "filename": file.filename,
            "created_at": time.time(),
            "params": params,
            "progress": 0,
            "stage": "En cola",
        })
        background_tasks.add_task(run_mastering_job, job_id, input_path, params)
        return {"job_id": job_id, "status": "queued", "poll_url": f"/job/{job_id}"}

    # ─── /master/sync ─────────────────────────────────────────────────
    @router.post("/master/sync", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_sync(
        file: UploadFile = File(...),
        platform_target: str = Query(None),
        output_format: str = Form("wav"),
        output_bit_depth: int = Query(24),
        loudness_target: Optional[float] = Query(None, ge=-30.0, le=-4.0),
        headroom_db: float = Query(-1.0, ge=-3.0, le=0.0),
        ceiling_db: float = Query(-0.3, ge=-1.0, le=0.0),
    ):
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth,
                  "headroom_db": headroom_db, "ceiling_db": ceiling_db}
        if loudness_target is not None:
            params["loudness_target"] = loudness_target
        if platform_target:
            params["platform_target"] = platform_target
        return await _run_mastering_sync(file, params)

    # ─── Helper: resolve reference params ──────────────────────────────
    async def _read_reference_params(reference_file: Optional[UploadFile], reference_source: str, reference_library_id: Optional[str]) -> dict:
        """Resuelve los params de referencia a partir de los Form fields del request.

        F10.1/F10.2-fix: antes leía atributos inexistentes del objeto ``fastapi.Request``
        (``request.reference_file``, ``request.reference_source``), que devolvía AttributeError
        cuando los endpoints async eran invocados. Ahora el caller declara los Form fields
        y los pasa explícitamente.
        """
        if reference_source == "library":
            if not reference_library_id:
                raise HTTPException(400, "reference_library_id required when reference_source=library")
            from library import library as _lib
            upload_dir = globals().get("UPLOAD_DIR") or os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
            )
            ref_path = _lib.get_path(upload_dir, reference_library_id)
            if not ref_path or not os.path.exists(ref_path):
                raise HTTPException(404, "Reference file not found")
            return {"path": str(ref_path), "filename": os.path.basename(ref_path)}
        elif reference_source == "upload":
            if reference_file is None:
                raise HTTPException(400, "reference_file required when reference_source=upload")
            data = await reference_file.read()
            filename = os.path.basename(getattr(reference_file, "filename", "reference.wav")) or "reference.wav"
            return {"data": data, "filename": filename}
        raise HTTPException(400, "Invalid reference_source")

    # ─── /master/reference ─────────────────────────────────────────────
    @router.post("/master/reference", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_with_reference(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        reference_file: Optional[UploadFile] = File(None),
        reference_source: str = Form("upload"),
        reference_library_id: Optional[str] = Form(None),
        platform_target: str = Query(None),
        output_format: str = Form("wav"),
        output_bit_depth: int = Query(24),
    ):
        ref_params = await _read_reference_params(reference_file, reference_source, reference_library_id)
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth, "reference": ref_params}
        if platform_target:
            params["platform_target"] = platform_target
        background_tasks.add_task(_run_reference_job, file, params)
        return {"status": "processing"}

    # ─── /master/reference/sync ───────────────────────────────────────
    @router.post("/master/reference/sync", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_with_reference_sync(
        file: UploadFile = File(...),
        reference_file: UploadFile = File(...),
        platform_target: str = Query(None),
        output_format: str = Form("wav"),
        output_bit_depth: int = Query(24),
        loudness_target: Optional[float] = Query(None, ge=-30.0, le=-4.0),
    ):
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth}
        if loudness_target is not None:
            params["loudness_target"] = loudness_target
        if platform_target:
            params["platform_target"] = platform_target
        return await _run_mastering_sync(file, params, reference_file=reference_file)

    # ─── /master/normalize ─────────────────────────────────────────────
    @router.post("/master/normalize", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_normalize(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        reference_file: Optional[UploadFile] = File(None),
        reference_source: str = Form("upload"),
        reference_library_id: Optional[str] = Form(None),
        platform_target: str = Query(None),
        output_format: str = Form("wav"),
        output_bit_depth: int = Query(24),
    ):
        ref_params = await _read_reference_params(reference_file, reference_source, reference_library_id)
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth, "normalize": True}
        if platform_target:
            params["platform_target"] = platform_target
        background_tasks.add_task(_run_normalize_job, file, params)
        return {"status": "processing"}

    # ─── /master/normalize/sync ────────────────────────────────────────
    @router.post("/master/normalize/sync", tags=["Mastering"], dependencies=[Depends(get_current_user)])
    async def master_normalize_sync(
        file: UploadFile = File(...),
        platform_target: str = Query(None),
        output_format: str = Form("wav"),
        output_bit_depth: int = Query(24),
        loudness_target: float = Query(-14.0, ge=-30.0, le=-4.0),
    ):
        params = {"output_format": output_format, "output_bit_depth": output_bit_depth,
                  "normalize": True, "loudness_target": loudness_target}
        if platform_target:
            params["platform_target"] = platform_target
        return await _run_mastering_sync(file, params)

    # ─── /pitch-correct ───────────────────────────────────────────────
    # B-S4: este endpoint era el único /master/* SIN auth — un agujero P0
    # conocido. Sin `dependencies=`, cualquiera podía disparar correcciones de
    # pitch costosas (CPU/GPU) sobre archivos arbitrarios sin presentar un JWT
    # válido, abriendo abuso de recursos y exfiltración de archivos ajenos.
    # `Depends(get_current_user)` valida firma Y exp del Bearer token antes de
    # tocar _run_pitch_job. Mismo patrón que los otros /master/* (línea 337).
    @router.post("/pitch-correct", tags=["Audioprocesamiento"], dependencies=[Depends(get_current_user)])
    async def pitch_correct(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        mode: str = Query("auto", description="auto|manual"),
        scale: Optional[str] = Query(None, description="e.g. C major, A minor"),
        corrections: Optional[int] = Query(None, ge=1, le=10),
    ):
        background_tasks.add_task(_run_pitch_job, file, mode, scale, corrections)
        return {"status": "processing", "mode": mode, "scale": scale}

    return router


# ─── Job runners (called by background_tasks) ─────────────────────────────────
# NOTA: /master y /master/reference async siguen usando el run_mastering_job
# real de job_runners.py (el que pasa por dependencies), que crea el job_id,
# trackea progreso y llama process_audio(**params) desempaquetado. Los
# endpoints /master/*/sync ya no necesitan runners propios: comparten
# _run_mastering_sync() definida arriba, que persiste a disco bajo
# /root/diego/backend/uploads (NO usa /tmp) y devuelve el WAV.

async def _run_reference_job(file: UploadFile, params: dict):
    """Job runner para /master/reference (async).

    F10.1-fix: antes recibía ``request`` y leía atributos inexistentes (``request.reference_file``);
    ahora recibe el ``UploadFile`` principal y el dict ``params`` ya resuelto por
    ``_read_reference_params`` (incluye ``reference`` con ``path`` o ``data``+``filename``).
    """
    from mastering import process_audio
    try:
        ref_meta = params.get("reference") or {}
        upload_dir = globals().get("UPLOAD_DIR") or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
        )
        os.makedirs(upload_dir, exist_ok=True)
        if "path" in ref_meta:
            input_path = ref_meta["path"]
            filename = ref_meta.get("filename") or os.path.basename(input_path)
        else:
            uid = uuid.uuid4().hex
            filename = os.path.basename(ref_meta.get("filename", "reference.wav")) or "reference.wav"
            input_path = os.path.join(upload_dir, f"job_in_{uid}_{filename}")
            with open(input_path, "wb") as fh:
                fh.write(ref_meta.get("data") or b"")
        params = dict(params)
        params["reference"] = {"path": input_path, "filename": filename}
        result = process_audio(input_path, **params)
        return {"status": "done", "path": result}
    except Exception as exc:
        logger.exception("Reference job failed: %s", exc)
        return {"status": "error", "error": "Reference mastering failed", "code": 500}

async def _run_normalize_job(file: UploadFile, params: dict):
    """Job runner para /master/normalize (async). Misma corrección que _run_reference_job."""
    from mastering import process_audio
    try:
        ref_meta = params.get("reference") or {}
        upload_dir = globals().get("UPLOAD_DIR") or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
        )
        os.makedirs(upload_dir, exist_ok=True)
        if "path" in ref_meta:
            input_path = ref_meta["path"]
            filename = ref_meta.get("filename") or os.path.basename(input_path)
        else:
            uid = uuid.uuid4().hex
            filename = os.path.basename(ref_meta.get("filename", "reference.wav")) or "reference.wav"
            input_path = os.path.join(upload_dir, f"job_in_{uid}_{filename}")
            with open(input_path, "wb") as fh:
                fh.write(ref_meta.get("data") or b"")
        params = dict(params)
        params["reference"] = {"path": input_path, "filename": filename}
        result = process_audio(input_path, **params)
        return {"status": "done", "path": result}
    except Exception as exc:
        logger.exception("Normalize job failed: %s", exc)
        return {"status": "error", "error": "Normalize mastering failed", "code": 500}

async def _run_pitch_job(file: UploadFile, mode: str, scale: Optional[str], corrections: Optional[int]):
    """Pitch correction global usando ``apply_pitch_shift``.

    El helper ``correct_pitch`` ya no existe en ``pitch_correction.py`` (sólo
    ``apply_pitch_shift``, ``detect_pitch_contour`` y ``quantize_to_scale``);
    aquí se reaplica el shift global con ``cents = corrections * 100``.
    El parámetro ``scale`` se ignora con warning porque la cuantización a
    escala musical requiere el pipeline completo (``detect_pitch_contour`` →
    ``quantize_to_scale`` → ``apply_time_varying_pitch_shift``) que está fuera
    del alcance de este fix mínimo del P0 (ImportError bloqueante).
    """
    import soundfile as sf
    from pitch_correction import apply_pitch_shift
    if scale:
        logger.warning("/pitch-correct: scale=%r ignorado en este fix mínimo (cuantización fuera de scope)", scale)
    try:
        data = await file.read()
        upload_dir = globals().get("UPLOAD_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
        in_path = os.path.join(upload_dir, f"pitch_in_{uuid.uuid4().hex}.tmp")
        out_path = os.path.join(upload_dir, f"pitch_out_{uuid.uuid4().hex}.wav")
        with open(in_path, "wb") as fh:
            fh.write(data)
        try:
            audio, sr = sf.read(in_path, always_2d=True, dtype="float32")
            cents = float((corrections or 0) * 100)
            shifted = apply_pitch_shift(audio, sr, cents=cents, mode="librosa")
            sf.write(out_path, shifted, sr, subtype="PCM_24")
            return {"status": "done", "path": out_path, "cents": cents}
        finally:
            if os.path.exists(in_path):
                try: os.remove(in_path)
                except Exception: pass
    except Exception as exc:
        logger.exception("Pitch job failed: %s", exc)
        return {"status": "error", "error": "Pitch correction failed", "code": 500}
