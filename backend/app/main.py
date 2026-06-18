import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.auth.routes import router as auth_router
from app.chat.routes import router as chat_router
from app.images.routes import router as images_router
from app.jobs.routes import router as jobs_router
from app.llm.routes import router as llm_router
from app.workflow.routes import router as workflow_router

# Route app loggers to uvicorn's handler so [tool] dispatch lines show up in
# the same terminal as the request log.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    force=True,  # override any handler uvicorn pre-installed on root
)

logger = logging.getLogger("app.validation")

app = FastAPI(title="Chatbot API")


@app.exception_handler(RequestValidationError)
async def _log_validation_error(request: Request, exc: RequestValidationError):
    """Default 422 hides WHICH field failed. Log it so the terminal shows the
    exact field + reason (e.g. quality not in enum, count out of range)."""
    logger.warning("422 on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


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
app.include_router(jobs_router)
app.include_router(llm_router)
app.include_router(workflow_router)


@app.get("/health")
def health():
    return {"status": "ok"}
