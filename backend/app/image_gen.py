# app/image_gen.py
import io
import math
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple

from PIL import Image

try:
    import torch
except Exception:
    torch = None

from diffusers import StableDiffusionPipeline
from app.services.s3_storage import upload_png_and_return_key
from app.core.config import get_settings

settings = get_settings()

_PIPE: Optional[StableDiffusionPipeline] = None


def _device() -> str:
    """Prefer GPU only if allowed and available."""
    return "cuda" if (settings.sd_use_cuda and torch and torch.cuda.is_available()) else "cpu"


def _dtype(device: str):
    if torch is None:
        return None
    return torch.float16 if device == "cuda" else torch.float32


def _snap_dim(n: int, base: int = 64) -> int:
    # SD pipelines are happiest with multiples of 64
    return max(base, int(round(n / base) * base))


def _apply_memory_savers(pipe: StableDiffusionPipeline) -> None:
    # Safe no-ops if not supported by the current pipeline
    for fn in ("enable_attention_slicing", "enable_vae_slicing", "enable_vae_tiling"):
        try:
            getattr(pipe, fn)(
                "max") if fn == "enable_attention_slicing" else getattr(pipe, fn)()
        except Exception:
            pass
    if settings.sd_enable_xformers:
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except Exception:
            pass


def _load_pipe() -> StableDiffusionPipeline:
    global _PIPE
    if _PIPE is not None:
        return _PIPE

    model_id = settings.sd_model_id
    dev = _device()
    dtype = _dtype(dev)

    if dtype is None:
        pipe = StableDiffusionPipeline.from_pretrained(model_id)
    else:
        pipe = StableDiffusionPipeline.from_pretrained(
            model_id, torch_dtype=dtype)

    _apply_memory_savers(pipe)

    if dev == "cuda":
        pipe = pipe.to("cuda")

    _PIPE = pipe
    return _PIPE


def _run_pipe_safe(pipe: StableDiffusionPipeline, **kw):
    """
    Try on current device; on CUDA OOM, empty cache and fall back to CPU once.
    """
    try:
        return pipe(**kw)
    except RuntimeError as e:
        msg = str(e)
        if "CUDA out of memory" in msg or "CUDNN_STATUS_ALLOC_FAILED" in msg:
            if torch and torch.cuda.is_available():
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
            # CPU fallback
            try:
                pipe.to("cpu")
                return pipe(**kw)
            except Exception:
                raise RuntimeError("OOM on GPU and CPU fallback failed") from e
        raise


def _maybe_downscale_for_budget(width: int, height: int, max_megapixels: float) -> Tuple[int, int, bool]:
    """
    If WxH exceeds the budget, scale down proportionally to fit.
    Returns (w, h, did_downscale).
    """
    req_area = width * height
    max_area = int(max_megapixels * 1_000_000)
    if req_area <= max_area:
        return _snap_dim(width), _snap_dim(height), False
    scale = (max_area / float(req_area)) ** 0.5
    return _snap_dim(int(width * scale)), _snap_dim(int(height * scale)), True


def generate_image_key_or_url(
    prompt: str,
    *,
    width: int = 768,
    height: int = 1024,
    # kept for call-site compatibility; overridden by settings.sd_steps
    steps: int = 12,
    guidance_scale: float = 1.8,     # same; overridden by settings.sd_guidance
    negative_prompt: Optional[str] = None,
    project_id: Optional[str] = None,
    seed: Optional[int] = None,
) -> Tuple[str, bool]:
    """
    Returns (identifier, is_key). If is_key=True -> identifier is an S3 key.
    If is_key=False -> identifier is a local static URL (dev fallback).

    Robust to limited VRAM:
      1) try on GPU,
      2) fallback to CPU,
      3) if still failing, generate under a megapixel budget and upsample to target size.
    """
    pipe = _load_pipe()

    # snap to SD-friendly dims
    req_w = _snap_dim(int(width))
    req_h = _snap_dim(int(height))

    # optional fixed seed
    generator = None
    if seed is not None and torch is not None:
        dev = _device()
        device_for_seed = dev if dev == "cuda" else "cpu"
        generator = torch.Generator(
            device=device_for_seed).manual_seed(int(seed))

    try:
        result = _run_pipe_safe(
            pipe,
            prompt=prompt,
            width=req_w,
            height=req_h,
            num_inference_steps=settings.sd_steps,
            guidance_scale=settings.sd_guidance,
            negative_prompt=negative_prompt,
            generator=generator,
        )
        image = result.images[0]
    except Exception:
        # final fallback: generate within MP budget, then upscale
        safe_w, safe_h, _ = _maybe_downscale_for_budget(
            req_w, req_h, settings.sd_max_mp)
        result = _run_pipe_safe(
            pipe,
            prompt=prompt,
            width=safe_w,
            height=safe_h,
            num_inference_steps=settings.sd_steps,
            guidance_scale=settings.sd_guidance,
            negative_prompt=negative_prompt,
            generator=generator,
        )
        small = result.images[0]
        image = small.resize((req_w, req_h), Image.LANCZOS)

    # ---- Upload / save ----
    if settings.s3_endpoint:
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        key = upload_png_and_return_key(
            str(project_id or "no-project"), buf.getvalue())
        return key, True

    # local dev fallback: save to disk and serve via /generated
    base_dir = Path(settings.generated_dir)
    out_dir = base_dir / str(project_id) if project_id else base_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f") + ".png"
    path = out_dir / filename
    image.save(path)

    base_url = settings.server_url.rstrip("/")
    url = f"{base_url}/generated/{project_id}/{filename}" if project_id else f"{base_url}/generated/{filename}"
    return url, False
