# 🎨 MIT Chat

> **Studio sáng tạo AI đa phương thức, local-first: chat, sinh ảnh, sửa ảnh, biến ảnh thành video và một workflow builder kéo-thả — tất cả gói trong một app, chạy trên GPU 4GB.**

🇻🇳 Tiếng Việt · 🇬🇧 [English](README.md)

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-qwen3%3A4b-000000?logo=ollama&logoColor=white)
![ComfyUI](https://img.shields.io/badge/ComfyUI-z--image%20%7C%20FLUX%20Kontext%20%7C%20LTX--Video-FF6B00)
![VRAM](https://img.shields.io/badge/VRAM-4GB%20RTX%203050-76B900?logo=nvidia&logoColor=white)
![License](https://img.shields.io/badge/License-Academic%20%2F%20Thesis-blue)

---

## 🚀 Tưởng tượng thử…

Bạn có một con **RTX 3050 4GB** — đúng cái card mà cả tá sinh viên đang cắm sẵn trong máy. Trên lý thuyết, 4GB còn chẳng nhét nổi *một* model lớn cho ra hồn. Vậy mà ở đây bạn được cả combo:

💬 **Chat LLM** có tool-calling → 🎨 **sinh ảnh từ text** → ✏️ **sửa ảnh bằng câu lệnh** → 🎬 **biến ảnh tĩnh thành video** → 🧩 ghép tất cả lại trong **một canvas workflow AI kéo-thả**.

**Đúng vậy — chạy hoàn toàn offline trên một con GPU 4GB.** Không API cloud trả phí. Không thuê server. Một app duy nhất.

Bí quyết kỹ thuật? Trên 4GB VRAM bạn *không thể* giữ hai model AI cùng lúc — nên hệ thống **đảm bảo không bao giờ có hai model nằm trong bộ nhớ cùng một thời điểm**, bằng cách điều phối chính xác lúc nào từng model được load/unload. Đỉnh RAM ≈ **7.5GB**, vừa khít với ~7GB trống cộng buffer.

Cần mạnh hơn? **Đổi đúng một biến môi trường.** Trỏ app sang một GPU remote khỏe hơn (ví dụ Google Colab T4 miễn phí) qua Cloudflare tunnel để mở khóa **FLUX.1 Kontext** (sửa ảnh theo lệnh thật sự) và **LTX-Video** — vẫn cùng một app, không phải dòng code nào.

---

## ✨ Tính năng (7 trụ cột — tất cả đã hoàn thiện)

| | Trụ cột | Mô tả |
|---|---|---|
| 💬 | **Chat LLM local** | Ollama chạy `qwen3:4b` **trên CPU**, có **tool-calling** (function calling). Hỗ trợ tiếng Việt + tiếng Anh. Tự đặt tiêu đề hội thoại, lưu full lịch sử, đổi tên, sidebar. Nút **Stop** thật sự — hủy câu trả lời đang sinh giữa chừng (cancel lời gọi Ollama phía server qua phát hiện client-disconnect). |
| 🎨 | **Text-to-image & sửa ảnh theo lệnh** | Qua **ComfyUI**, hai backend hoán đổi bằng đúng một biến `COMFY_BACKEND`: `zimage` = **z-image-turbo GGUF Q4** (local, vừa 4GB, 4 bước) cho txt2img + img2img kiểu denoise; `flux_kontext` = **FLUX.1 Kontext** trên GPU rộng/remote cho **sửa ảnh theo lệnh thật sự** ("đổi nền thành bãi biển"). Preset chất lượng / tỉ lệ khung / số ảnh (1–4) ngay trên UI. |
| 🎬 | **Image-to-video** | **LTX-Video (i2v)**: hoạt họa một ảnh tĩnh thành clip ngắn với một motion prompt. Tự chọn checkpoint **13B hoặc 2B** theo VRAM của GPU. Chạy trên GPU rộng/cloud (không chạy trên máy 4GB). |
| 🧩 | **Visual Workflow canvas** | Node editor (dựng trên **@xyflow/react** / React Flow) trên tab riêng. Các loại node: **Text, LLM (Qwen), Image** (txt2img + img2img bằng cách nối ảnh tham chiếu)**, Upload, Video, Output**. Kéo-thả từ palette (thu gọn được), nối port (có kiểu, mã màu), **chạy cả graph** HOẶC **chạy một node** kèm đúng các node nó phụ thuộc. Auto-layout một-cú-click (topological trái→phải). Import/Export workflow dạng JSON. Output được giữ qua reload. Thực thi theo thứ tự topological do frontend điều khiển; kết quả được cache nên node không đổi thì không chạy lại. |
| ⚙️ | **Điều phối job trên một GPU** | Một **async lock dùng chung trong tiến trình** xếp tuần tự MỌI lần sinh (chat VÀ workflow) để hai job không bao giờ tranh nhau cái GPU duy nhất — **hàng đợi FIFO** nghiêm ngặt. Một thanh **"Jobs"** toàn cục (kéo được, thu gọn được) hiển thị mọi job đang chờ/đang chạy trên toàn app và cho phép **FORCE-CANCEL** bất kỳ job nào (interrupt ComfyUI giữa chừng render). Cứ bắn một loạt job rồi ngồi xem nó cạn dần. |
| 🖼️ | **Asset library + gallery** | Panel cạnh bên gom mọi thứ bạn đã sinh/upload, cộng một **gallery full màn hình** với multi-select và **bulk download**. |
| 🔐 | **Tài khoản & lưu trữ** | Đăng ký/đăng nhập bằng **JWT** (mật khẩu băm bcrypt, token 7 ngày); hội thoại + tin nhắn + ảnh lưu trong **SQLite**. |

---

## 🏗️ Kiến trúc

```
 Next.js (3000)  --HTTP/JSON-->  FastAPI (8000)  --HTTP+WS-->  ComfyUI (8188, local hoặc Cloudflare tunnel)
                                      |           --HTTP-->     Ollama (11434, LLM local)
                                      v
                       SQLite (app.db) + storage/images (phục vụ tại /static)
```

**Backend là bộ điều phối (orchestrator).** Luồng cốt lõi: nhận tin nhắn → hỏi LLM (kèm tools) → nếu LLM gọi một tool thì dispatch sang ComfyUI → đưa kết quả ngược lại LLM → trả lời cuối. Một **GPU lock dùng chung** xếp tuần tự toàn bộ việc sinh, đảm bảo cái GPU duy nhất chỉ phục vụ một job tại một thời điểm.

---

## 🧠 Thử thách 4GB — phần engineering đáng tự hào nhất

Đây là linh hồn của đồ án. Trên **4GB VRAM**, ranh giới giữa "chạy được" và "out of memory" mong manh đến mức từng MB đều phải có chủ. Đây là cách hệ thống ép một con card phổ thông gánh cả một studio AI đa phương thức:

- 🧩 **LLM chạy trên CPU** (Ollama) — nên **không bao giờ tranh VRAM** với ComfyUI.
- ⏱️ **`OLLAMA_KEEP_ALIVE` gắn theo nơi ComfyUI chạy**: ComfyUI local → unload LLM **ngay** (`"0"`) để giải phóng ~3GB; ComfyUI remote → **giữ LLM ấm** (`"30m"`).
- 🎛️ **ComfyUI chạy `--normalvram` mặc định** (tự chia VRAM/RAM thông minh), **KHÔNG** dùng `--lowvram`.
- 🧹 Sau mỗi lần sinh local, backend gọi **`/free` của ComfyUI** để unload model và xóa cache GPU.
- 🔒 Một **`asyncio.Lock` cấp module** ép cái GPU duy nhất chạy **đúng một-job-một-lúc**, xuyên suốt cả chat lẫn workflow.

> 💡 **Kết quả ròng:** Tại **không một thời điểm nào** có hai model diffusion/LLM cùng nằm trong bộ nhớ. Đỉnh RAM ≈ `max(LLM, ComfyUI) + overhead` ≈ **7.5GB** — vừa khít với ~7GB trống cộng buffer.

---

## ⚡ Quickstart

### Yêu cầu trước
- **Python 3.11+** (đang chạy 3.13)
- **Node 18+**
- **Ollama** (đã `ollama pull qwen3:4b`)
- Một **ComfyUI** đang chạy với đúng model: **z-image-turbo** cho local; **FLUX Kontext / LTX-Video** cho remote.

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Copy .env.example -> .env và điền: JWT_SECRET, COMFY_BASE_URL, COMFY_BACKEND, OLLAMA_* ...
cp .env.example .env          # Windows: copy .env.example .env

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Mở http://localhost:3000
```

### (Tùy chọn) GPU remote — mở khóa FLUX Kontext + LTX-Video

Chạy notebook trong `colab/`: nó khởi động ComfyUI + một **Cloudflare quick tunnel** và in ra một `COMFY_BASE_URL`. Dán URL đó vào `backend/.env`, đặt `COMFY_BACKEND=flux_kontext`, rồi **restart backend**.

> 🌐 ComfyUI client tự chuyển `http→ws` / `https→wss`, hỗ trợ header service-token của **Cloudflare Access (Zero-Trust)** (tùy chọn), và **chịu được tunnel chập chờn**: WebSocket rớt thì fallback sang polling `/history`, kèm một WS open-timeout cấu hình được.

---

## 🗺️ Chế độ triển khai

| | 🏠 100% Local | ☁️ Hybrid / Scale-up |
|---|---|---|
| **LLM** | Ollama (`qwen3:4b` trên CPU) | Ollama (giữ ấm) |
| **Image/Video** | ComfyUI + **z-image-turbo** trên RTX 3050 4GB | ComfyUI remote (vd Colab T4) |
| **Backend env** | `COMFY_BACKEND=zimage` | `COMFY_BACKEND=flux_kontext` + `COMFY_BASE_URL=<tunnel>` |
| **Mở khóa** | Chat + sinh ảnh + img2img (denoise) — **fully offline** | + **FLUX Kontext** sửa ảnh theo lệnh + **LTX-Video** |
| **Kết nối** | Tất cả localhost | Cloudflare quick tunnel (+ tùy chọn Zero-Trust) |

---

## 🧰 Tech stack

| Lớp | Công nghệ |
|---|---|
| **Backend** | Python 3.11+ (chạy 3.13), FastAPI, SQLAlchemy 2.0, Alembic, SQLite, JWT (python-jose) + bcrypt, httpx, websockets |
| **LLM** | Ollama, `qwen3:4b` (tool-calling) |
| **Image / Video** | ComfyUI — z-image-turbo (GGUF Q4) local; FLUX.1 Kontext + LTX-Video trên GPU remote |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, @xyflow/react (React Flow v12) |

---

## 🔮 Roadmap (chưa làm — định hướng tương lai)

> ⚠️ Các mục dưới đây **chưa được implement**; đây là hướng phát triển sau MVP.

- 🌍 Nhà cung cấp **LLM text trên cloud** (OpenAI-compatible, vd DashScope/Qwen) chọn được theo từng request.
- 🖼️ Đường sinh ảnh **trên cloud**.
- 💳 Hệ thống **credits/quota** cho việc dùng cloud trả phí.
- 👤 Hệ thống **user/profile** phong phú hơn.

---

## ⚖️ Giới hạn đã biết (nói thẳng)

- **z-image img2img** tuyệt cho style transfer / biến thể, nhưng **yếu ở các lệnh sửa chính xác** — và đó chính xác là lý do **FLUX Kontext (remote)** tồn tại như đường nâng cấp.
- **Sinh video local không khả thi trên 4GB** — video chạy trên GPU rộng/remote.
- **Job registry nằm trong tiến trình** (một Uvicorn worker) — hoàn hảo cho thiết kế single-user/single-GPU này; **không** dành cho multi-worker.

---

## 📁 Cấu trúc repo

```
backend/
  app/
    main.py, config.py
    auth/                  # JWT, bcrypt
    chat/                  # orchestrator
    llm/                   # ollama_client, tools, /llm/complete
    comfyui/               # client, injector, presets, workflows/*.json
    images/                # txt2img / img2img / i2v
    jobs/                  # registry + cancel
    workflow/              # CRUD
    db/                    # models, 5 bảng (gồm cả workflows)
  alembic/                 # migrations

frontend/
  app/                     # chat/[id], workflow/[id], layout, icon.svg
  components/
    workflow/              # canvas, nodes
    JobsBar, AssetLibrary/Gallery, MessageBubble/Input, sidebars
  lib/                     # api, workflow/ (registry, engine), mediaPresets, types

colab/                     # notebook ComfyUI + Cloudflare tunnel
docs/                      # PROJECT_OVERVIEW, architecture/end-to-end-flow
```

---

## 🎓 Credits

Thực hiện như một **đồ án tốt nghiệp** tại **Trường Đại học Công nghiệp Hà Nội (HaUI)** — ngành Khoa học Máy tính. Dự án mang tính **học thuật / giáo dục**.

> *Made with 4GB of VRAM and a lot of careful memory accounting.* 🟢
