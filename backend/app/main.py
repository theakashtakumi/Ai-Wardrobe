from fastapi import FastAPI

app = FastAPI(
    title="AI Wardrobe API",
    description="Backend API for the Personal AI Wardrobe project",
    version="0.1.0"
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