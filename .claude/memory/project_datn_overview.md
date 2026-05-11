---
name: DATN HaUI - Chatbot tạo ảnh/video local
description: Đồ án tốt nghiệp HaUI — chatbot LLM local + ComfyUI tạo/edit ảnh, có UI + auth user. Bao gồm phase mapping chi tiết.
type: project
---

## Mục tiêu MVP
- Chatbot web có đăng nhập/đăng ký (cần DB).
- LLM chạy local, chat thường + khi user yêu cầu thì BE call ComfyUI API tạo/edit ảnh.
- Video: hoãn, làm sau.
- Tiêu chí: chạy được là đủ, không cần chất lượng cao.

## Hardware constraint (CỐT LÕI)
- GPU: RTX 3050 **4GB VRAM** — share giữa ComfyUI và LLM.
- LLM: model nhỏ, chạy CPU (Ollama default) để không tranh VRAM với ComfyUI.

## Stack đã chốt
- BE: Python + FastAPI.
- FE: Next.js / React + Tailwind.
- LLM runtime: Ollama (local, **qwen3:4b** CPU) + Qwen API qua DashScope OpenAI-compatible (cloud). User chọn 1 trong 2 mỗi request qua dropdown.
- Qwen3 strategy: chat thường prefix `/no_think` để skip thinking (tốc độ ~ngang 3B); khi có tools (Phase 5) để full think mode cho dispatch chính xác. **Set `OLLAMA_KEEP_ALIVE=0`** (force unload sau mỗi request) để khi ComfyUI gen ảnh có đủ RAM. Trade-off: mỗi LLM call reload model 10-15s. Phase 7 cần set env này trong `run_dev.bat` hoặc tài liệu setup.
- ComfyUI: chạy **không thêm flag VRAM** — default `--normalvram` đã tự split smart giữa VRAM (4GB) và RAM, ưu tiên nhét layer compute-heavy vào VRAM để tối đa GPU speed. KHÔNG dùng `--lowvram` (sẽ ép tất cả qua RAM → chậm). Mỗi `ComfyClient.generate()` BE tự gọi `/free` (commit `c12803d`) để unload model sau gen → đảm bảo swap z-image ↔ OmniGen2 không OOM.
- Resolution cap: 512-768px cho cả gen và edit. >1024 dễ OOM.
- Image gen: ComfyUI (gọi qua API HTTP /prompt + WS /ws progress).
- DB: SQLite.
- Migrations: Alembic, setup từ Phase 1.
- Auth: JWT HS256 + bcrypt, token trong localStorage FE.
- Storage: filesystem `backend/app/storage/images/`, mount FastAPI `/static`.

## Models đã có / sẽ có
- `z-image-turbo-Q4_K_S.gguf` (UNet GGUF, txt2img). Đã chạy được qua ComfyUI.
- `qwen_3_4b.safetensors` (text encoder, lumina2).
- `ae.safetensors` (VAE).
- Workflow mẫu txt2img: `c:\Users\leduc\Downloads\image_z_image_turbo.json` — KSampler 4 steps, cfg 1, sampler `res_multistep`, scheduler `simple`, ModelSamplingAuraFlow shift=3, EmptySD3LatentImage 512x512.
- Phase 7 edit: **z-image-turbo img2img** (cùng model với Phase 4 txt2img, KHÔNG tải thêm). Lý do (sau 2 lần research lại): OmniGen2 native cần 17GB VRAM, GGUF Q4 vẫn cần Qwen2.5-VL encoder → 5-15 min/edit khi offload; Qwen-Image-Edit-2511 dùng Qwen2.5-VL-7B encoder KHÁC qwen_3_4b mày đã có (không reuse được), Q2_K stack >12GB → swap pagefile; FLUX Kontext Q2_K borderline 3-6min/edit với swap risk. Trên RTX 3050 4GB + 7GB free RAM, KHÔNG model instruction-edit nào chạy được <3min reliably.
- Phase 7 implementation: workflow giống txt2img, thay `EmptySD3LatentImage` bằng `LoadImage`+`VAEEncode`, `KSampler.denoise=0.5-0.75`. Tool `edit_image(image_id, target_prompt, strength=0.65)` — target_prompt là mô tả **ảnh đích toàn bộ**, KHÔNG phải instruction "đổi X thành Y". LLM (qwen3:4b) sẽ phải dịch user instruction thành full description trước khi call tool.
- Scope edit Phase 7: tốt cho style transfer, variations. Yếu cho color swap, object add (cần model instruction-trained không chạy được trên hardware này). Báo cáo DATN cần document giới hạn này.

## Project layout — root
```
DATN-_HaUI/                 (e:\Python\DATN-_HaUI, git init tại root)
├── backend/
├── frontend/
├── .gitignore
└── README.md
```

## Phase mapping (chi tiết user đã chốt — bám đúng từng folder/file)

**Pre-Phase 0**: chỉ skeleton root. Init git tại root. .gitignore chuẩn Python+Node.

**Phase 0** — test ComfyUI API standalone, throwaway:
```
backend/comfy_test/
├── workflow_txt2img.json    # export từ ComfyUI
└── test_comfy.py             # script httpx test /prompt + WS + /view
```
Sau Phase 5 sẽ xóa hoặc move sang `scripts/`.

**Phase 1** — FastAPI + Auth + SQLite + Alembic:
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── db/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   ├── session.py
│   │   └── models.py        # User only
│   └── auth/
│       ├── __init__.py
│       ├── routes.py
│       ├── schemas.py
│       ├── jwt.py
│       ├── security.py
│       └── deps.py
├── alembic/                  # alembic init alembic
├── alembic.ini
├── .env / .env.example
└── requirements.txt
```

**Phase 2** — Ollama chat thuần (chưa DB chat, chưa tool):
```
backend/app/
├── llm/
│   ├── __init__.py
│   └── ollama_client.py
└── chat/
    ├── __init__.py
    ├── routes.py            # POST /chat stateless
    └── schemas.py
```

**Phase 3** — persist conversation:
- Sửa `db/models.py`: thêm Conversation, Message.
- Sửa `chat/routes.py`: thêm GET /conversations, GET /conversations/{id}.
- Thêm `chat/repository.py`.
- Migration alembic mới: "add conversation message".

**Phase 4** — ComfyUI client (folder name: `comfyui/` KHÔNG phải `comfy/`):
```
backend/app/
├── comfyui/
│   ├── __init__.py
│   ├── client.py            # submit_prompt, wait_for_completion, fetch_image
│   └── workflows/
│       └── txt2img_zimage.json    # move từ comfy_test/
└── storage/
    └── images/              # gitignore
```
Mount `/static` → `storage/images/` trong main.py.

**Phase 5** — tool calling Ollama:
- Thêm `app/llm/tools.py` (TOOLS schema).
- Thêm `app/chat/orchestrator.py` (chat loop + tool dispatch).
- Refactor `chat/routes.py` gọi orchestrator.
- `db/models.py`: thêm Image model, thêm cột tool_call/tool_result vào Message.
- Migration mới.

**Phase 5.5** — refactor LLM provider abstraction:
```
backend/app/llm/
├── base.py                   # LLMProvider abstract
├── ollama_provider.py        # rename + refactor từ ollama_client.py
├── qwen_provider.py          # mới (DashScope OpenAI-compatible)
├── factory.py                # get_provider(name)
└── tools.py                  # giữ nguyên
```
Xóa `ollama_client.py` cũ. Update orchestrator dùng factory.

**Phase 6** — Next.js FE:
```
frontend/                    # npx create-next-app --typescript --app --tailwind
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── (auth)/login/page.tsx, (auth)/register/page.tsx
│   └── chat/layout.tsx, chat/page.tsx, chat/[id]/page.tsx
├── components/
│   ├── ChatBox.tsx, MessageBubble.tsx, ImageMessage.tsx
│   ├── ProviderToggle.tsx, ConversationList.tsx
├── lib/
│   ├── api.ts (fetch wrapper + JWT từ localStorage)
│   ├── auth.ts, types.ts
├── .env.local               # NEXT_PUBLIC_API_URL=http://localhost:8000
├── package.json, tsconfig.json
```

**Phase 7** — img2img edit:
- Thêm `backend/app/comfyui/workflows/img2img_edit.json`.
- Thêm tool `edit_image` vào `app/llm/tools.py`.
- Có thể thêm endpoint upload ảnh vào `app/images/`.
- Không tạo folder mới nếu không cần.

## DB tables (cuối cùng sau Phase 7)
- `users` (Phase 1)
- `conversations`, `messages` (Phase 3)
- `images` (Phase 5)

## Provider switch (Phase 5.5+)
- `ChatRequest` có field `provider: "ollama" | "qwen"`.
- DashScope endpoint: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, model `qwen-turbo`/`qwen-plus`.
- `.env` có `DASHSCOPE_API_KEY`.

**Why:** User đã chốt phase mapping chi tiết tới từng file/folder. Bám đúng để không over-engineer và không lệch khỏi mental model của user.
**How to apply:** Mỗi khi user yêu cầu "làm phase X" → tạo đúng các file trong scope phase X (xem mapping trên), không thêm không bớt. Folder name dùng đúng `comfyui/` không phải `comfy/`. Alembic có từ Phase 1 không phải defer. Storage path là `backend/app/storage/images/`. Đọc thêm `feedback_incremental_scaffolding.md` cho nguyên tắc chung.
