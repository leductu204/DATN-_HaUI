# DATN-HaUI

Đồ án tốt nghiệp HaUI: chatbot LLM local có khả năng tạo và chỉnh sửa ảnh qua ComfyUI, có hệ thống đăng nhập/đăng ký người dùng.

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic + SQLite
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind
- **LLM**: Ollama (local, qwen2.5:3b) hoặc Qwen API qua DashScope (cloud) — user chọn mỗi request
- **Image generation**: ComfyUI với z-image-turbo (txt2img) và Qwen-Image-Edit (img2img)

## Yêu cầu hệ thống

- Python 3.11+, Node.js 20+
- ComfyUI đã cài và chạy được (port 8188)
- Ollama (cho LLM local): `ollama pull qwen2.5:3b`
- GPU khuyến nghị 4GB VRAM trở lên (project được build/test trên RTX 3050 4GB)

## Chạy backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

## Chạy frontend

(Sẽ thêm khi vào Phase 6.)
