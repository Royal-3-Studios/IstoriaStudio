import os
from diffusers import StableDiffusionPipeline
import torch
from PIL import Image
import uuid

# Load model once
pipe = StableDiffusionPipeline.from_pretrained(
    "runwayml/stable-diffusion-v1-5", torch_dtype=torch.float16
).to("cuda")


def generate_image(prompt: str) -> str:
    image = pipe(prompt).images[0]

    # ✅ Ensure the directory exists
    output_dir = "app/generated"
    os.makedirs(output_dir, exist_ok=True)

    filename = f"output_{uuid.uuid4().hex}.png"
    path = os.path.join(output_dir, filename)
    image.save(path)
    return path
