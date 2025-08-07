from fastapi import APIRouter, Query
from app.image_gen import generate_image
from fastapi.responses import FileResponse

router = APIRouter()


# @router.get("/generate")
# async def generate(prompt: str = Query(...)):
#     image_path = generate_image(prompt)
#     return {"image": image_path}


@router.get("/generate")
async def generate(prompt: str = Query(...)):
    image_path = generate_image(prompt)
    return FileResponse(image_path, media_type="image/png")
