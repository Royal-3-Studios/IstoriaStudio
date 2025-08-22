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
_PIPE_CPU: Optional[StableDiffusionPipeline] = None


def _load_pipe_cpu_fp32() -> StableDiffusionPipeline:
    """
    A separate CPU pipeline instantiated in float32 so CPU fallback works.
    Kept alongside the main cached pipe to avoid cross-casting.
    """
    global _PIPE_CPU
    if _PIPE_CPU is not None:
        return _PIPE_CPU

    model_id = settings.sd_model_id
    pipe = StableDiffusionPipeline.from_pretrained(
        model_id, torch_dtype=torch.float32)
    _apply_memory_savers(pipe)
    pipe = pipe.to("cpu")
    _PIPE_CPU = pipe
    return _PIPE_CPU


def _to_cpu_float32(pipe):
    """
    Ensure the pipeline AND its major submodules are on CPU in float32.
    Needed because CPU LayerNorm doesn't support float16.
    """
    try:
        pipe.to("cpu")
    except Exception:
        pass
    if torch is None:
        return
    for name in ("text_encoder", "unet", "vae"):
        mod = getattr(pipe, name, None)
        if mod is not None:
            try:
                mod.to(dtype=torch.float32, device="cpu")
            except Exception:
                # best-effort: some pipelines may name components differently
                pass


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


# --- replace _run_pipe_safe with this hardened version ---
def _run_pipe_safe(pipe: StableDiffusionPipeline, **kw):
    """
    Try on current device; on CUDA OOM or FP16-on-CPU issues, swap to a dedicated CPU/FP32 pipe.
    """
    try:
        return pipe(**kw)
    except RuntimeError as e:
        msg = str(e)

        # 1) GPU memory issues -> use CPU/FP32
        if "CUDA out of memory" in msg or "CUDNN_STATUS_ALLOC_FAILED" in msg:
            if torch and torch.cuda.is_available():
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
            cpu_pipe = _load_pipe_cpu_fp32()
            return cpu_pipe(**kw)

        # 2) Already on CPU but FP16 modules (LayerNorm / dtype warnings)
        if "not implemented for 'Half'" in msg or "dtype=torch.float16 cannot run with cpu device" in msg:
            cpu_pipe = _load_pipe_cpu_fp32()
            return cpu_pipe(**kw)

        # Otherwise: bubble up
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
    steps: int = 12,                 # kept for call-site compatibility
    guidance_scale: float = 1.8,     # ditto; settings override below
    negative_prompt: Optional[str] = None,
    project_id: Optional[str] = None,
    seed: Optional[int] = None,
) -> Tuple[str, bool]:
    """
    Returns (identifier, is_key). If is_key=True -> S3 key.
    If is_key=False -> local static URL (dev fallback).

    Strategy:
      1) Proactively cap megapixels on the FIRST attempt to stay on GPU.
      2) If anything still fails, try a smaller size on a CPU/FP32 pipe as last resort.
      3) If we generated smaller, upscale back to the requested size.
    """
    pipe = _load_pipe()

    # Snap to SD-friendly dims
    req_w = _snap_dim(int(width))
    req_h = _snap_dim(int(height))

    # Proactively cap pixels BEFORE first run (stay on-GPU, avoid OOM)
    safe_w, safe_h, did_downscale = _maybe_downscale_for_budget(
        req_w, req_h, settings.sd_max_mp
    )

    # Optional fixed seed
    generator = None
    if seed is not None and torch is not None:
        dev = _device()
        device_for_seed = dev if dev == "cuda" else "cpu"
        generator = torch.Generator(
            device=device_for_seed).manual_seed(int(seed))

    try:
        # First attempt: use (possibly downscaled) safe_w/safe_h
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
        image = result.images[0]

    except Exception:
        # Last resort: shrink further & force CPU/FP32 pipeline
        cpu_pipe = _load_pipe_cpu_fp32()
        fallback_mp = min(settings.sd_max_mp, 1.0)  # hard fallback ~1MP
        fb_w, fb_h, _ = _maybe_downscale_for_budget(req_w, req_h, fallback_mp)

        result = _run_pipe_safe(
            cpu_pipe,
            prompt=prompt,
            width=fb_w,
            height=fb_h,
            num_inference_steps=settings.sd_steps,
            guidance_scale=settings.sd_guidance,
            negative_prompt=negative_prompt,
            generator=generator,
        )
        image = result.images[0]
        # If we rendered smaller, upscale to target
        if fb_w != req_w or fb_h != req_h:
            image = image.resize((req_w, req_h), Image.LANCZOS)

    else:
        # If the first attempt rendered smaller, upscale to target
        if did_downscale and (safe_w != req_w or safe_h != req_h):
            image = image.resize((req_w, req_h), Image.LANCZOS)

    # ---- Upload / save ----
    if settings.s3_endpoint:
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        key = upload_png_and_return_key(
            str(project_id or "no-project"), buf.getvalue())
        return key, True

    base_dir = Path(settings.generated_dir)
    out_dir = base_dir / str(project_id) if project_id else base_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f") + ".png"
    path = out_dir / filename
    image.save(path)

    base_url = settings.server_url.rstrip("/")
    url = (
        f"{base_url}/generated/{project_id}/{filename}"
        if project_id
        else f"{base_url}/generated/{filename}"
    )
    return url, False
