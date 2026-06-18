# PROJECT OVERVIEW — DATN HaUI

> **Tài liệu này dùng để làm gì?**
> Đây là bản tổng hợp toàn diện về đồ án, đóng vai trò "nguồn sự thật" để:
> 1. Cung cấp ngữ cảnh đầy đủ cho AI (vd Claude trong Word) khi viết/cập nhật báo cáo.
> 2. Tham chiếu nhanh khi trình bày kiến trúc, công nghệ, chức năng.
>
> Tài liệu được cập nhật mỗi khi project có thay đổi lớn. Phần kỹ thuật chi tiết (luồng từng bước, sơ đồ ASCII) nằm ở [docs/architecture/end-to-end-flow.md](architecture/end-to-end-flow.md).
> Cập nhật lần cuối: 2026-06-04 (trạng thái: MVP local hoàn thành Phase 1–7).

---

## 1. Giới thiệu đề tài

Đồ án tốt nghiệp ngành Khoa học Máy tính (HaUI): xây dựng một **chatbot AI đa tác vụ** chạy trên máy cá nhân, có khả năng:
- Trò chuyện bằng ngôn ngữ tự nhiên (tiếng Việt/Anh) qua mô hình ngôn ngữ lớn (LLM).
- Khi người dùng yêu cầu, **tự động tạo ảnh** từ mô tả văn bản (text-to-image).
- **Chỉnh sửa ảnh** vừa tạo (image-to-image: đổi phong cách, biến thể).
- Có hệ thống **đăng ký / đăng nhập người dùng**, lưu lịch sử hội thoại và ảnh đã tạo.

Điểm nhấn của đề tài: toàn bộ phần AI (LLM + sinh ảnh) **chạy local (offline)** trên một GPU phổ thông giá rẻ (RTX 3050 4GB VRAM), thay vì phụ thuộc API trả phí. Đây vừa là mục tiêu, vừa là ràng buộc kỹ thuật cốt lõi chi phối mọi quyết định thiết kế.

---

## 2. Mục tiêu và phạm vi

**Mục tiêu MVP (đã đạt):**
- Web chatbot có xác thực người dùng (đăng ký/đăng nhập, JWT).
- LLM chạy local, chat thường; khi user yêu cầu thì backend điều phối (orchestrate) sang ComfyUI để tạo/sửa ảnh.
- Lưu trữ hội thoại, tin nhắn, ảnh trong cơ sở dữ liệu.
- Tiêu chí: hệ thống chạy được end-to-end trên phần cứng giới hạn; không đặt nặng chất lượng ảnh.

**Ngoài phạm vi MVP (để lại cho hướng phát triển):** sinh video, model cloud, hệ thống credits/quota (xem mục 11).

---

## 3. Ràng buộc phần cứng (cốt lõi)

- **GPU: NVIDIA RTX 3050, 4GB VRAM** — phải chia sẻ giữa ComfyUI (sinh ảnh) và LLM.
- RAM trống khả dụng: ~7GB.
- Vì giới hạn này, hệ thống được thiết kế để **không bao giờ có hai model AI cùng chiếm bộ nhớ một lúc** (xem mục 8 — tối ưu low-VRAM). Đây là lý do nhiều quyết định kiến trúc (LLM chạy CPU, unload model sau mỗi lần gọi, chọn model sinh ảnh nhẹ).

---

## 4. Kiến trúc tổng thể

Hệ thống gồm **4 thành phần chạy độc lập**, backend đóng vai trò bộ điều phối (orchestrator):

```
Next.js Frontend  ──HTTP/JSON──▶  FastAPI Backend  ──HTTP+WebSocket──▶  ComfyUI (sinh ảnh)
   (port 3000)                       (port 8000)    ──HTTP──▶            Ollama (LLM local)
                                          │                              (port 11434)
                                          ▼
                                   SQLite (app.db)  +  storage/images/ (file PNG)
```

- **Frontend (Next.js)**: giao diện chat, đăng nhập, hiển thị ảnh.
- **Backend (FastAPI)**: xác thực, lưu hội thoại, và quan trọng nhất — vòng lặp điều phối: nhận tin nhắn → hỏi LLM → nếu LLM quyết định gọi "tool" thì dispatch sang ComfyUI → trả kết quả về LLM → LLM viết câu trả lời cuối.
- **Ollama**: chạy LLM local, hỗ trợ giao thức tool-calling (function calling).
- **ComfyUI**: engine sinh ảnh, điều khiển qua API HTTP (`/prompt`) + WebSocket (`/ws` theo dõi tiến trình).

---

## 5. Công nghệ sử dụng

| Lớp | Công nghệ | Ghi chú |
|---|---|---|
| Backend | Python 3.11+, FastAPI 0.136, SQLAlchemy 2.0, Alembic | REST API, ORM, migration |
| CSDL | SQLite | File `app.db`, đủ cho quy mô đồ án |
| Xác thực | JWT (HS256, python-jose), bcrypt | Token hết hạn 7 ngày, lưu ở localStorage FE |
| LLM runtime | Ollama, model **qwen3:4b** (mặc định, chạy CPU) | Hỗ trợ tool-calling |
| Sinh ảnh | ComfyUI + **z-image-turbo** (GGUF Q4) | txt2img và img2img dùng chung 1 model |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 | |
| Giao tiếp AI | httpx (HTTP), websockets (theo dõi tiến trình ComfyUI) | |

**Mô hình sinh ảnh chi tiết:**
- UNet: `z-image-turbo-Q4_K_S.gguf` (lượng tử hóa Q4 cho nhẹ VRAM).
- Text encoder: `qwen_3_4b.safetensors` (kiến trúc lumina2).
- VAE: `ae.safetensors`.
- Tham số sinh: KSampler 4 bước, cfg=1, sampler `res_multistep`, scheduler `simple`, ModelSamplingAuraFlow shift=3, độ phân giải 512×512 (cap ≤768 để tránh tràn VRAM).

---

## 6. Các chức năng chính

1. **Đăng ký / Đăng nhập** — email + username + mật khẩu (hash bcrypt), trả về JWT.
2. **Chat thường** — hội thoại văn bản với LLM, có lưu lịch sử theo từng cuộc (conversation).
3. **Quản lý hội thoại** — danh sách hội thoại ở sidebar, tiêu đề tự suy ra từ tin nhắn đầu, đổi tên inline, sắp xếp theo lần cập nhật gần nhất.
4. **Sinh ảnh từ văn bản** — khi user yêu cầu "vẽ/tạo ảnh...", LLM gọi tool `generate_image`, backend dispatch sang ComfyUI và trả ảnh về trong khung chat.
5. **Chỉnh sửa ảnh** — user yêu cầu "đổi sang phong cách anime..." trên ảnh vừa tạo, LLM gọi tool `edit_image`, backend tự lấy ảnh mới nhất của user làm ảnh nguồn (img2img).

**Hai tool LLM có thể gọi** (định nghĩa ở `backend/app/llm/tools.py`):
- `generate_image(prompt, seed?)` — sinh ảnh mới.
- `edit_image(target_prompt, strength?)` — sửa ảnh gần nhất; `target_prompt` là mô tả **ảnh đích đầy đủ** (không phải câu lệnh "đổi X thành Y"); `strength` 0.4–0.8 điều khiển mức thay đổi.

---

## 7. Cơ sở dữ liệu

4 bảng (SQLite, quản lý migration bằng Alembic):

- **users**: id, email (unique), username (unique), password_hash, created_at.
- **conversations**: id, user_id (FK, cascade), title, created_at, updated_at.
- **messages**: id, conversation_id (FK, cascade), role (`user`/`assistant`/`tool`/`system`), content, tool_calls (JSON, nullable), tool_call_id (nullable), created_at.
- **images**: id, user_id (FK, cascade), prompt, seed, filename (uuid .png), created_at.

Ảnh lưu dưới dạng file PNG trong `backend/app/storage/images/`, phục vụ qua FastAPI StaticFiles tại đường dẫn `/static`.

---

## 8. Tối ưu cho phần cứng giới hạn (low-VRAM)

Đây là phần đáng nhấn mạnh nhất trong báo cáo vì nó thể hiện xử lý kỹ thuật cho ràng buộc 4GB VRAM:

1. **LLM chạy CPU** (Ollama mặc định) — không tranh VRAM với ComfyUI.
2. **`OLLAMA_KEEP_ALIVE=0`** — Ollama giải phóng model ngay sau mỗi lần trả lời, nhả ~3GB RAM cho ComfyUI. Đánh đổi: mỗi lần gọi LLM phải nạp lại model (~10–15s cold-load).
3. **ComfyUI dùng chế độ mặc định `--normalvram`** — tự chia thông minh giữa VRAM và RAM (không dùng `--lowvram` vì sẽ ép hết qua RAM gây chậm).
4. **Backend gọi `/free` sau mỗi lần sinh ảnh** — ép ComfyUI unload model, xóa cache GPU, đảm bảo lần sau nạp model không tràn bộ nhớ.
5. **Tách biệt thời điểm dùng bộ nhớ**: LLM call 1 (ComfyUI rảnh) → ComfyUI sinh ảnh (LLM đã unload) → LLM call 2 (ComfyUI đã `/free`). Không thời điểm nào hai model cùng giữ bộ nhớ.

Đỉnh RAM tại mọi thời điểm ≈ `max(model_LLM, model_ComfyUI) + overhead` ≈ 7.5GB — vừa khít.

---

## 9. Luồng xử lý (tóm tắt)

Backend chạy một **vòng lặp điều phối tool-calling**:
1. Lưu tin nhắn user → gắn system prompt → gọi LLM kèm danh sách tools.
2. Nếu LLM trả về `tool_calls` → backend thực thi từng tool (sinh/sửa ảnh qua ComfyUI) → lưu kết quả dạng message `role=tool`.
3. Gọi LLM lần 2 với lịch sử đã có kết quả tool → LLM viết câu trả lời cuối.
4. Có giới hạn an toàn `MAX_TOOL_ITERATIONS=3` chống lặp vô hạn.

Sơ đồ chi tiết từng bước (3 use case: chat thường / sinh ảnh / sửa ảnh) kèm thời gian ước tính nằm ở [end-to-end-flow.md](architecture/end-to-end-flow.md).

---

## 10. Giới hạn hiện tại (cần ghi rõ trong báo cáo)

- **Sửa ảnh bằng z-image img2img** tốt cho chuyển phong cách / tạo biến thể, nhưng **yếu với chỉnh sửa theo lệnh chính xác** (đổi màu một vật thể, thêm/bớt đối tượng) — vì z-image là model txt2img base, không được huấn luyện cho tác vụ edit. Các model edit chuyên dụng (Qwen-Image-Edit, FLUX Kontext) cần >8GB VRAM nên không chạy được trên 4GB.
- **Edit tự lấy ảnh mới nhất** — tool `edit_image` không nhận id ảnh cụ thể, đủ cho phần lớn tình huống chat nhưng không sửa được ảnh cũ giữa chuỗi.
- **HTTP đồng bộ (blocking)** — request sinh ảnh có thể block tới ~90s; chưa có streaming (SSE/WebSocket) cho phản hồi.
- **An toàn đơn người dùng** — nếu nhiều user sinh ảnh đồng thời, ComfyUI xử lý tuần tự (không tràn bộ nhớ nhưng phải chờ).
- **Chưa có sinh video.**

---

## 11. Trạng thái hiện tại & lộ trình

### Đã hoàn thành (MVP local — Phase 1–7)
- Phase 1: FastAPI + Auth + SQLite + Alembic.
- Phase 2–3: Chat với Ollama + lưu hội thoại/tin nhắn.
- Phase 4: ComfyUI client (txt2img).
- Phase 5: Tool-calling + orchestrator + bảng images.
- Phase 6: Frontend Next.js (auth, chat, sidebar, hiển thị ảnh).
- Phase 7: Sửa ảnh img2img (tool `edit_image`).

### Hướng phát triển tiếp theo (CHƯA implement)
1. **LLM cloud (text)** — thêm provider gọi API cloud (thiết kế Phase 5.5: trừu tượng hóa `LLMProvider` + factory, dùng DashScope/Qwen OpenAI-compatible). Tool schema đã viết sẵn theo chuẩn OpenAI để tái dùng. Người dùng chọn local hay cloud mỗi request.
2. **Sinh ảnh cloud** — đường tạo ảnh qua API cloud song song ComfyUI local, bù cho giới hạn 4GB VRAM.
3. **Sinh video cloud** — tính năng tạo video (đã hoãn ở MVP).
4. **Hệ thống user nâng cao** — mở rộng quá khỏi auth cơ bản (profile, phân quyền…).
5. **Credits / quota** — cơ chế tín dụng kiểm soát chi phí khi gọi model cloud trả phí.

---

## 12. Cấu trúc thư mục (rút gọn)

```
DATN-_HaUI/
├── backend/
│   ├── app/
│   │   ├── main.py              # khởi tạo FastAPI, CORS, mount /static
│   │   ├── config.py            # cấu hình (.env): JWT, Ollama, ComfyUI
│   │   ├── auth/                # đăng ký, đăng nhập, JWT, bảo mật
│   │   ├── chat/                # routes, orchestrator (vòng lặp tool), repository
│   │   ├── llm/                 # ollama_client.py, tools.py (schema 2 tool)
│   │   ├── comfyui/             # client.py, injector.py, workflows/*.json
│   │   ├── images/              # routes, service, repository (sinh/sửa/lưu ảnh)
│   │   ├── db/                  # models.py (4 bảng), session, base
│   │   └── storage/images/      # file PNG (gitignore)
│   ├── alembic/                 # migrations theo từng phase
│   └── requirements.txt
├── frontend/                    # Next.js 16 App Router
│   ├── app/                     # auth, chat/[id], layout
│   ├── components/              # Sidebar, MessageBubble, MessageInput...
│   └── lib/                     # api.ts, auth.ts, types.ts
├── colab/                       # notebook ComfyUI + FLUX Kontext (thử nghiệm)
└── docs/
    ├── PROJECT_OVERVIEW.md      # (tài liệu này)
    └── architecture/end-to-end-flow.md
```

---

## 13. Ghi chú cho AI viết báo cáo

Khi dùng tài liệu này để viết/cập nhật báo cáo Word:
- Phần **8 (low-VRAM)** và **10 (giới hạn)** là điểm kỹ thuật đáng khai thác sâu, thể hiện năng lực giải quyết ràng buộc thực tế.
- Phân biệt rõ **đã làm (mục 11 phần đầu)** với **dự định (mục 11 phần sau)** — tránh viết tính năng chưa có như đã hoàn thành.
- Cần sơ đồ luồng chi tiết → lấy từ [end-to-end-flow.md](architecture/end-to-end-flow.md).
- Mô hình LLM mặc định hiện tại là **qwen3:4b** (theo `config.py`); README cũ có thể ghi `qwen2.5:3b` — ưu tiên giá trị trong code.
