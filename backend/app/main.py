from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.data.sample_wardrobe import sample_wardrobe
from app.models.clothing import ClothingItem

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="AI Wardrobe API",
    description="Backend API for the Personal AI Wardrobe project",
    version="0.1.0"
)

app.mount(
    "/uploads",
    StaticFiles(directory="uploads"),
    name="uploads",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "AI Wardrobe API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/wardrobe")
def get_wardrobe():
    return sample_wardrobe

@app.post("/upload")
async def upload_clothing_image(file: UploadFile = File(...)):
    file_extension = Path(file.filename).suffix.lower()

    allowed_extensions = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
    }

    if file_extension not in allowed_extensions:
        return {
            "error": "Unsupported image format"
        }

    unique_filename = f"{uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    file_contents = await file.read()

    with open(file_path, "wb") as image_file:
        image_file.write(file_contents)

    return {
        "message": "Image uploaded successfully",
        "filename": unique_filename,
        "path": str(file_path),
    }

@app.post("/wardrobe")
async def create_clothing_item(
    name: str = Form(...),
    file: UploadFile = File(...),
):
    file_extension = Path(file.filename).suffix.lower()

    allowed_extensions = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
    }

    if file_extension not in allowed_extensions:
        return {
            "error": "Unsupported image format"
        }

    clothing_id = f"CLOTH_{len(sample_wardrobe) + 1:03d}"

    unique_filename = f"{uuid4()}{file_extension}"

    file_path = UPLOAD_DIR / unique_filename

    file_contents = await file.read()

    with open(file_path, "wb") as image_file:
        image_file.write(file_contents)

    clothing_item = ClothingItem(
        id=clothing_id,
        name=name,
        category="Unknown",
        color="Unknown",
        image_path=str(file_path),
    )

    sample_wardrobe.append(clothing_item)

    return clothing_item