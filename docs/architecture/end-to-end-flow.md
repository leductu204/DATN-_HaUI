# End-to-End Flow

Tài liệu mô tả luồng xử lý hoàn chỉnh của chatbot DATN HaUI từ lúc user gõ tin nhắn đến khi thấy phản hồi (kèm ảnh nếu có).

## Tổng quan kiến trúc

```
┌──────────────┐    HTTP/JSON     ┌──────────────┐    HTTP+WS      ┌──────────────┐
│  Next.js FE  │ ───────────────▶ │  FastAPI BE  │ ──────────────▶ │   ComfyUI    │
│  (port 3000) │                  │  (port 8000) │                 │  (port 8188) │
└──────────────┘                  └──────┬───────┘                 └──────────────┘
                                         │
                                         │ HTTP                     ┌──────────────┐
                                         └────────────────────────▶ │    Ollama    │
                                                                    │  (port 11434)│
                                                                    └──────────────┘

Storage:
  - SQLite app.db        (users, conversations, messages, images metadata)
  - storage/images/      (PNG files, served qua FastAPI /static)
```

3 service chạy độc lập, BE đóng vai trò orchestrator gọi 2 service AI bên dưới.

---

## 3 use case chính

### 1. Chat thường (không gọi tool)

User hỏi "2 + 2 bằng mấy" — LLM trả lời text, không cần gen ảnh.

```
[Browser]
    │  User gõ "2 + 2 bằng mấy", nhấn Enter
    ▼
[Next.js FE]
    │  POST /conversations/{id}/messages
    │  Headers: Authorization: Bearer <JWT>
    │  Body: {"content": "2 + 2 bằng mấy", "provider": "ollama"}
    ▼
[FastAPI BE]
    │  ① auth.deps.get_current_user — decode JWT, query User from DB
    │  ② chat/repository — kiểm tra ownership conversation (user_id match)
    │  ③ orchestrator.handle_message:
    │     ├─ Save user message vào bảng `messages`
    │     ├─ Nếu là msg đầu tiên → derive title từ 60 ký tự đầu
    │     ├─ list_messages → build messages array cho LLM
    │     └─ Prepend SYSTEM_PROMPT (hướng dẫn LLM khi nào dùng tool)
    ▼
[BE → Ollama]
    │  POST http://localhost:11434/api/chat
    │  Body: {
    │    "model": "qwen3:4b",
    │    "messages": [...system, ...history, {role: user, content: "2+2 bằng mấy"}],
    │    "tools": [generate_image_schema, edit_image_schema],
    │    "stream": false
    │  }
    ▼
[Ollama]
    │  ④ Load qwen3:4b model vào RAM (~3GB) nếu chưa loaded
    │  ⑤ Thinking phase (qwen3 có chain-of-thought ẩn)
    │  ⑥ Decide: câu hỏi đơn giản, không cần tool → return text
    │     Response: {"message": {"role": "assistant", "content": "2 + 2 = 4"}}
    │  ⑦ Nếu OLLAMA_KEEP_ALIVE=0 → unload model sau response
    ▼
[BE orchestrator]
    │  ⑧ Không có tool_calls → save assistant message với content="2 + 2 = 4"
    │  ⑨ Update conversations.updated_at
    │  ⑩ Return MessageOut JSON
    ▼
[FE]
    │  ⑪ Receive assistant message
    │  ⑫ Refetch toàn bộ /conversations/{id}/messages + /conversations
    │  ⑬ Update local state, dispatch event "conversations-changed"
    │  ⑭ Sidebar reload (title mới + updated_at order)
    │  ⑮ Render: user bubble blue right, assistant bubble slate left
```

**Tổng thời gian**: ~5-15s (chủ yếu là Ollama inference trên CPU).

---

### 2. Generate image (chat → tool generate_image)

User gõ "Vẽ con mèo cam đang ngồi cửa sổ" — LLM gọi tool, BE dispatch sang ComfyUI.

```
[Browser]
    │  User gõ "Vẽ con mèo cam đang ngồi cửa sổ"
    ▼
[FE → BE]  (giống use case 1, bước ①-③)
    │
[BE → Ollama]  POST /api/chat với tools=[generate_image, edit_image]
    │
[Ollama]
    │  ④ Quyết định: user yêu cầu vẽ → gọi tool
    │     Response: {
    │       "message": {
    │         "role": "assistant",
    │         "content": "",
    │         "tool_calls": [{
    │           "function": {
    │             "name": "generate_image",
    │             "arguments": {"prompt": "orange fluffy cat sitting on windowsill, soft natural light"}
    │           }
    │         }]
    │       }
    │     }
    ▼
[BE orchestrator]
    │  ⑤ Save assistant message:
    │     role=assistant, content="", tool_calls=[{function:{...}}]
    │  ⑥ Loop tool_calls → dispatch:
    │     name="generate_image", args={prompt: "orange fluffy cat..."}
    │
[BE → image_service.generate_and_save]
    │  ⑦ Load workflow template: app/comfyui/workflows/txt2img_zimage.json
    │     12 nodes: UnetLoaderGGUF, CLIPLoader, VAELoader, EmptySD3LatentImage,
    │     CLIPTextEncode (positive), ConditioningZeroOut (negative),
    │     ModelSamplingAuraFlow, KSampler, VAEDecode, SaveImage, ...
    │  ⑧ injector.inject_txt2img:
    │     - Deepcopy template
    │     - Patch node "57:27".inputs.text ← prompt
    │     - Patch node "57:3".inputs.seed ← random int64
    │     - Patch node "57:13".inputs.width/height ← 512x512
    │
[BE → ComfyClient]
    │  ⑨ Submit:
    │     POST http://localhost:8188/prompt
    │     Body: {"prompt": <patched_workflow>, "client_id": "<uuid>"}
    │     Response: {"prompt_id": "abc-123"}
    │  ⑩ Wait for completion:
    │     Connect ws://localhost:8188/ws?clientId=<uuid>
    │     Loop recv() đến khi nhận message:
    │       {"type": "executing", "data": {"prompt_id": "abc-123", "node": null}}
    │     (null node = DONE)
    │
[ComfyUI]
    │  ⑪ Load z-image-turbo-Q4_K_S.gguf vào VRAM (~5-7s, nếu chưa loaded)
    │  ⑫ Load qwen_3_4b.safetensors text encoder
    │  ⑬ CLIPTextEncode: encode prompt thành conditioning tensor
    │  ⑭ ModelSamplingAuraFlow shift=3 (config cho z-image)
    │  ⑮ KSampler: 4 steps, cfg=1, sampler=res_multistep, scheduler=simple
    │  ⑯ VAEDecode: latent → image RGB
    │  ⑰ SaveImage: lưu PNG vào ComfyUI/output/z-image-turbo_00xxx.png
    │  ⑱ FreeMemoryImage node: free image tensor
    │  ⑲ Send WS: {"type": "executing", "node": null, "prompt_id": "abc-123"}
    ▼
[BE ComfyClient]
    │  ⑳ Fetch metadata:
    │     GET http://localhost:8188/history/abc-123
    │     Response: {"abc-123": {"outputs": {"9": {"images": [{"filename": "z-image-turbo_00xxx.png"}]}}}}
    │  ㉑ Fetch image bytes:
    │     GET http://localhost:8188/view?filename=z-image-turbo_00xxx.png&type=output
    │     Response: <bytes PNG>
    │  ㉒ /free (low-VRAM swap):
    │     POST http://localhost:8188/free
    │     Body: {"unload_models": true, "free_memory": true}
    │     → ComfyUI unload model khỏi VRAM + RAM, clear torch cache
    │
[BE image_service]
    │  ㉓ Save PNG vào backend/app/storage/images/<uuid>.png
    │  ㉔ INSERT INTO images (user_id, prompt, seed, filename, created_at)
    │  ㉕ Return Image row
    │
[BE orchestrator]
    │  ㉖ Save tool result message:
    │     role=tool, tool_call_id=<uuid>, content=JSON({status:"ok", url:"/static/images/<uuid>.png", image_id: N})
    │  ㉗ Loop iteration 2: gọi lại Ollama với history giờ có:
    │     [system, ..., user(vẽ mèo), assistant(tool_calls), tool(result)]
    │
[Ollama]
    │  ㉘ Đọc tool result, generate text reply
    │     Response: {"message": {"role": "assistant", "content": "Đã tạo xong ảnh theo yêu cầu!"}}
    │
[BE]
    │  ㉙ Save final assistant message
    │  ㉚ touch_conversation (updated_at)
    │  ㉛ Return final assistant message JSON cho FE
    │
[FE]
    │  ㉜ Refetch messages list → bây giờ có user + assistant(tool_calls) + tool + assistant(text)
    │  ㉝ MessageBubble render:
    │     - user bubble (right, blue)
    │     - assistant với tool_calls + content rỗng → SKIP (placeholder)
    │     - tool message → parse content JSON → <img src="/static/images/<uuid>.png" />
    │     - assistant final → text bubble (left, slate)
    │  ㉞ /static/images/<uuid>.png được FastAPI StaticFiles middleware serve trực tiếp
```

**Tổng thời gian**: ~40-70s
- LLM call 1 (decide tool): 5-10s
- Model load (lần đầu): 5-7s
- ComfyUI gen (4 steps, 512x512): 15-30s
- /free + I/O: 2-3s
- LLM call 2 (write reply): 5-10s
- FE refetch + render: <1s

---

### 3. Edit image (chat → tool edit_image)

User vừa gen ảnh xong, gõ "Make it anime style" — LLM gọi `edit_image`, BE auto-pick ảnh mới nhất.

```
[Browser]
    │  User gõ "Make it anime style"
    ▼
[FE → BE]  (như cũ)
[BE → Ollama]  POST /api/chat với tools
    │
[Ollama]
    │  ① Đọc context: có ảnh vừa gen → user muốn edit
    │     Response: {
    │       "tool_calls": [{
    │         "function": {
    │           "name": "edit_image",
    │           "arguments": {
    │             "target_prompt": "anime style orange fluffy cat sitting on windowsill, vibrant anime art, cel shading",
    │             "strength": 0.7
    │           }
    │         }
    │       }]
    │     }
    │  ─── LLM tự rewrite "make it anime" → full description English (system prompt hướng dẫn)
    ▼
[BE orchestrator → _dispatch_tool "edit_image"]
    │  ② images.repository.get_latest_user_image(user_id):
    │     SELECT * FROM images WHERE user_id=? ORDER BY created_at DESC LIMIT 1
    │     → source_image (ảnh con mèo vừa gen)
    │  ③ Nếu None → return {status: "error", error: "No image to edit..."}
    │
[BE → image_service.edit_and_save]
    │  ④ Đọc bytes: backend/app/storage/images/<source_uuid>.png
    │
[BE → ComfyClient]
    │  ⑤ Upload ảnh vào ComfyUI input folder:
    │     POST http://localhost:8188/upload/image
    │     Content-Type: multipart/form-data
    │     Fields: image=<bytes>, overwrite=true, type=input
    │     Response: {"name": "<source_uuid>.png", "subfolder": "", "type": "input"}
    │
[BE → injector]
    │  ⑥ Load template: img2img_zimage.json
    │     KHÁC txt2img: thay node EmptySD3LatentImage bằng LoadImage + VAEEncode
    │  ⑦ Inject:
    │     - "57:27".text ← target_prompt
    │     - "57:3".seed ← random
    │     - "57:3".denoise ← 0.7 (strength)
    │     - "load_input".image ← "<source_uuid>.png"
    │
[BE → ComfyUI]
    │  ⑧ Submit workflow (giống use case 2 bước ⑨-⑲ nhưng với img2img:
    │     - LoadImage đọc PNG từ input/
    │     - VAEEncode: image → latent
    │     - KSampler bắt đầu từ latent này (chứ không phải noise rỗng)
    │     - denoise=0.7 → bỏ 70% latent gốc, giữ 30% structure
    │  ⑨ Output PNG mới đã edit
    │
[BE]
    │  ⑩ Fetch PNG bytes
    │  ⑪ /free unload model
    │  ⑫ Save bytes vào storage/images/<new_uuid>.png
    │  ⑬ INSERT INTO images (user_id, prompt=target_prompt, seed, filename=<new_uuid>.png)
    │  ⑭ Return new Image
    │
[BE orchestrator]
    │  ⑮ Save tool result message với content={status:"ok", url:"/static/images/<new_uuid>.png", edited_from: <source_id>}
    │  ⑯ LLM call 2 → "Ảnh edit xong rồi."
    │  ⑰ Save final assistant message
    │  ⑱ Return cho FE
    │
[FE]
    │  ⑲ Render tool result làm image card → user thấy ảnh con mèo anime
```

**Tổng thời gian**: ~30-50s (nhanh hơn use case 2 vì model đã warm sau gen, không có cold-load).

---

## Schema DB (cuối Phase 7)

```sql
users
├── id PK
├── email UNIQUE
├── username UNIQUE
├── password_hash (bcrypt)
└── created_at

conversations
├── id PK
├── user_id FK→users (ON DELETE CASCADE, indexed)
├── title (default "New chat", auto-derived từ first msg)
├── created_at
└── updated_at (auto bump mỗi lần touch)

messages
├── id PK
├── conversation_id FK→conversations (ON DELETE CASCADE, indexed)
├── role (user | assistant | tool | system)
├── content (Text)
├── tool_calls (JSON, nullable — chỉ set ở assistant message gọi tool)
├── tool_call_id (String(64), nullable — chỉ set ở tool result message)
└── created_at

images
├── id PK
├── user_id FK→users (ON DELETE CASCADE, indexed)
├── prompt (Text)
├── seed (BigInteger)
├── filename (String(255), uuid hex .png)
└── created_at
```

---

## Auth flow

```
Register:
  FE POST /auth/register {email, username, password}
  BE: validate, hash bằng bcrypt 5.0, INSERT user, return UserOut

Login:
  FE POST /auth/login (form-urlencoded vì FastAPI OAuth2PasswordRequestForm)
  Body: username=alice&password=secret123
  BE: lookup user (email HOẶC username), verify bcrypt, create JWT HS256 (7 days)
  Response: {access_token, token_type: "bearer"}

Mỗi request sau:
  FE đính kèm Authorization: Bearer <JWT>
  BE deps.get_current_user → decode JWT → lookup User → inject vào route handler
```

---

## Tool calling protocol (Ollama spec)

`POST /api/chat` accept field `tools`:

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "generate_image",
        "description": "...",
        "parameters": {
          "type": "object",
          "properties": {
            "prompt": {"type": "string", "description": "..."},
            "seed": {"type": "integer"}
          },
          "required": ["prompt"]
        }
      }
    },
    ...
  ]
}
```

Response khi LLM quyết định gọi tool:

```json
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "function": {
          "name": "generate_image",
          "arguments": {"prompt": "..."}
        }
      }
    ]
  }
}
```

BE phải:
1. Save assistant message với `tool_calls` JSON
2. Dispatch từng tool_call → execute → collect result
3. Save 1 `role=tool` message per tool call với `content` là JSON result, `tool_call_id` là UUID tự generate
4. Loop lại: gọi Ollama lần 2 với history có thêm tool result → LLM viết text reply
5. Save final assistant message với content text

Có safety net: `MAX_TOOL_ITERATIONS=3` để tránh vòng lặp vô hạn nếu LLM cứ gọi tool mãi.

---

## Low-VRAM optimizations (RTX 3050 4GB + ~7GB free RAM)

1. **ComfyUI default `--normalvram`**: tự split smart giữa VRAM (4GB) và RAM, ưu tiên VRAM cho compute-heavy layer.
2. **`ComfyClient.generate()` luôn POST `/free` sau gen**: ép ComfyUI unload toàn bộ model, clear torch cache. Đảm bảo lần sau (gen hoặc edit) load model mới không OOM.
3. **`OLLAMA_KEEP_ALIVE=0`**: Ollama unload qwen3:4b ngay sau mỗi LLM call → giải phóng ~3GB RAM cho ComfyUI giai đoạn gen. Trade-off: mỗi LLM call sau cold-load 10-15s.
4. **Tool flow tách biệt LLM/ComfyUI**: LLM call 1 (Ollama up, ComfyUI idle) → ComfyUI gen (Ollama unloaded, ComfyUI loaded) → LLM call 2 (ComfyUI unloaded sau `/free`, Ollama reload). Không có moment nào cả 2 cùng giữ memory.

Peak RAM tại bất kỳ thời điểm: `max(Ollama_model, ComfyUI_model) + overhead` ≈ `max(3GB, 6GB) + 1.5GB` ≈ **7.5GB**, vừa với 7GB free + chút buffer.

---

## Các điểm tối ưu/limit hiện tại

- **Blocking HTTP**: `/conversations/{id}/messages` block tới 90s khi gen ảnh. Browser fetch timeout mặc định ~5 phút, OK cho DATN. Production nên switch SSE/WebSocket streaming.
- **Single-user safe, multi-user race**: nếu 2 user gen ảnh đồng thời, ComfyUI queue trên `/prompt` xử lý tuần tự. Không OOM nhưng user 2 phải đợi user 1.
- **Edit auto-pick latest image**: tool `edit_image` không nhận `image_id` explicit, BE tự lấy `get_latest_user_image`. Hạn chế: không edit được ảnh cũ giữa chain mới hơn. Đủ cho 95% use case chat.
- **Z-image img2img scope**: tốt cho style transfer + variations; yếu cho instruction edit chính xác (color swap, object add). Lý do: z-image là txt2img base, không được train cho edit task. Model edit chuyên dụng (Qwen-Image-Edit, FLUX Kontext) cần >8GB VRAM, không fit 4GB.
- **No SSE/streaming**: response text không streaming, FE chờ trọn message rồi render. UX có thể nâng cấp bằng SSE ở Phase tương lai.

---

## File tham chiếu

| Component | Path |
|---|---|
| Tool schemas | [backend/app/llm/tools.py](../../backend/app/llm/tools.py) |
| Orchestrator | [backend/app/chat/orchestrator.py](../../backend/app/chat/orchestrator.py) |
| Ollama client | [backend/app/llm/ollama_client.py](../../backend/app/llm/ollama_client.py) |
| ComfyUI client | [backend/app/comfyui/client.py](../../backend/app/comfyui/client.py) |
| Workflow injector | [backend/app/comfyui/injector.py](../../backend/app/comfyui/injector.py) |
| Image service | [backend/app/images/service.py](../../backend/app/images/service.py) |
| txt2img workflow | [backend/app/comfyui/workflows/txt2img_zimage.json](../../backend/app/comfyui/workflows/txt2img_zimage.json) |
| img2img workflow | [backend/app/comfyui/workflows/img2img_zimage.json](../../backend/app/comfyui/workflows/img2img_zimage.json) |
| DB models | [backend/app/db/models.py](../../backend/app/db/models.py) |
| FE chat page | [frontend/app/chat/[id]/page.tsx](../../frontend/app/chat/[id]/page.tsx) |
| FE message renderer | [frontend/components/MessageBubble.tsx](../../frontend/components/MessageBubble.tsx) |
