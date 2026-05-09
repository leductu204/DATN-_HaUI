from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router

app = FastAPI(title="Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chat_router)


@app.get("/health")
def health():
    return {"status": "ok"}
