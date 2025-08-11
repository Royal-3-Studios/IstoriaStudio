# import os
# from diffusers import StableDiffusionPipeline
# import torch
# from PIL import Image
# import uuid

# # Load model once
# pipe = StableDiffusionPipeline.from_pretrained(
#     "runwayml/stable-diffusion-v1-5", torch_dtype=torch.float16
# ).to("cuda")


# def generate_image(prompt: str) -> str:
#     image = pipe(prompt).images[0]

#     # ✅ Ensure the directory exists
#     output_dir = "app/generated"
#     os.makedirs(output_dir, exist_ok=True)

#     filename = f"output_{uuid.uuid4().hex}.png"
#     path = os.path.join(output_dir, filename)
#     image.save(path)
#     return path

# app/image_gen.py
import os
from pathlib import Path
from datetime import datetime

try:
    import torch
except Exception as e:
    torch = None  # allow import even if torch isn't installed in some envs

from diffusers import StableDiffusionPipeline

pipe = None  # lazy-initialized


def _get_device():
    if torch and torch.cuda.is_available() and os.getenv("USE_CUDA", "1") == "1":
        return "cuda"
    return "cpu"


def _get_dtype(device: str):
    if torch is None:
        return None  # diffusers will choose defaults; CPU path okay
    return torch.float16 if device == "cuda" else torch.float32


def _get_pipe():
    global pipe
    if pipe is not None:
        return pipe

    device = _get_device()
    dtype = _get_dtype(device)
    model_id = os.getenv("SD_MODEL_ID", "runwayml/stable-diffusion-v1-5")

    # Load once, on first call
    if dtype is not None:
        p = StableDiffusionPipeline.from_pretrained(
            model_id, torch_dtype=dtype)
    else:
        p = StableDiffusionPipeline.from_pretrained(model_id)

    if device == "cuda":
        p = p.to("cuda")

    pipe = p
    return pipe


def generate_image(prompt: str) -> str:
    p = _get_pipe()
    image = p(prompt).images[0]

    out_dir = Path("app/generated")
    out_dir.mkdir(parents=True, exist_ok=True)

    filename = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f") + ".png"
    path = out_dir / filename
    image.save(path)

    # Return a URL your frontend can load
    base_url = os.getenv("SERVER_URL", "http://localhost:8000")
    return f"{base_url}/generated/{filename}"
