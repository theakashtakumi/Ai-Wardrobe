from fastapi import FastAPI
from app.data.sample_wardrobe import sample_wardrobe

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AI Wardrobe API",
    description="Backend API for the Personal AI Wardrobe project",
    version="0.1.0"
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