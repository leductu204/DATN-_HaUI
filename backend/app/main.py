from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.images.routes import router as images_router

app = FastAPI(title="Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static mount for generated images. StaticFiles needs the directory to exist
# at startup, so create it before mounting.
_STORAGE_ROOT = Path(__file__).resolve().parent / "storage"
(_STORAGE_ROOT / "images").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_STORAGE_ROOT)), name="static")

app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(images_router)


@app.get("/health")
def health():
    return {"status": "ok"}
