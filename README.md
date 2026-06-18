# 🪄 MIT Chat

**A self-hosted, local-first multimodal AI creative studio — chat, generate, edit, and animate, all on a 4GB GPU.**

🇬🇧 English · 🇻🇳 [Tiếng Việt](README.vi.md)

![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Next.js%2016-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS%204-06B6D4?logo=tailwindcss&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-Ollama%20qwen3%3A4b-000000?logo=ollama&logoColor=white)
![Diffusion](https://img.shields.io/badge/Diffusion-ComfyUI-6E40C9)
![GPU](https://img.shields.io/badge/Runs%20on-RTX%203050%204GB-76B900?logo=nvidia&logoColor=white)
![Local First](https://img.shields.io/badge/Local--First-No%20paid%20cloud%20required-22C55E)
![License](https://img.shields.io/badge/Project-Academic%20%2F%20Thesis-blue)

---

## ⚡ The pitch

Chat with an LLM. Generate an image from text. Edit it by instruction. Animate it into a clip. Wire all of it together on a drag-and-drop AI canvas — from **one app**, running **entirely offline**, on the **4GB NVIDIA RTX 3050** already sitting in a student's laptop.

On 4GB of VRAM you normally can't comfortably hold *even one* large model. MIT Chat's core engineering feat is a **GPU orchestrator that guarantees two AI models are never resident at the same time** — it controls exactly when each one loads and unloads. Peak RAM lands at **≈ 7.5GB**, fitting in ~7GB free plus buffer.

Need more horsepower? **Flip one environment variable.** Point the app at a beefier remote GPU (e.g. a free Google Colab T4) over a Cloudflare tunnel and you unlock **FLUX.1 Kontext** instruction-editing and **LTX-Video**. Same app, same UI — just an env var.

---

## 🚀 Features

Seven pillars, all implemented and working today.

| | Pillar | What it does |
|---|---|---|
| 💬 | **Local LLM chat** | **Ollama** running **qwen3:4b on CPU** with **tool-calling**. Speaks Vietnamese and English. Auto-titled conversations, full history, inline rename, sidebar. A real **Stop** button aborts an in-flight reply mid-generation — it cancels the Ollama call server-side via client-disconnect detection. |
| 🎨 | **Text-to-image & instruction edit** | **ComfyUI** with two interchangeable backends, chosen by one env var (`COMFY_BACKEND`). `zimage` = **z-image-turbo** GGUF Q4 — local, fits 4GB, 4-step txt2img plus denoise-based img2img. `flux_kontext` = **FLUX.1 Kontext** on a roomier/remote GPU for true instruction editing (*"change the background to a beach"*). Quality, aspect-ratio, and count (1–4) presets in the UI. |
| 🎬 | **Image-to-video** | **LTX-Video** (i2v): animate a still into a short clip with a motion prompt. Auto-picks the **13B or 2B** checkpoint based on the GPU's VRAM. Runs on a roomier/cloud GPU — not the 4GB box. |
| 🧩 | **Visual workflow canvas** | A node editor (**@xyflow/react** / React Flow v12) on its own tab. Node types: **Text, LLM (Qwen), Image** (txt2img + img2img by wiring a reference), **Upload, Video, Output**. Drag-and-drop from a collapsible palette, wire **typed, color-coded ports**, run the whole graph *or* a single node plus just its dependencies. One-click **auto-layout** (topological, left→right). **Import/Export** as JSON. Outputs persist across reload. Execution is frontend-driven in topological order; results cache so unchanged nodes don't re-run. |
| ⚙️ | **Single-GPU job orchestration** | One shared in-process **async lock** serialises **every** generation — chat *and* workflow — so two jobs never fight for the one GPU. Strict **FIFO** queue. A draggable, collapsible global **Jobs bar** shows every queued/running job across the app and can **force-cancel** any of them (interrupts ComfyUI mid-render). Fire off many jobs and watch them drain. |
| 🖼️ | **Asset library + gallery** | A side panel of everything you've generated or uploaded, plus a full-screen gallery with **multi-select and bulk download**. |
| 🔐 | **Accounts & persistence** | Register/login with **JWT** (bcrypt-hashed passwords, 7-day token). Conversations, messages, and images persisted in **SQLite**. |

---

## 🏗️ Architecture

```
  Next.js (3000)  ──HTTP/JSON──►  FastAPI (8000)  ──HTTP+WS──►  ComfyUI (8188)
   React 19 / TS                       │                        local or Cloudflare tunnel
   Tailwind 4                          │
   @xyflow/react                       ├──────HTTP──────────►  Ollama (11434, local LLM)
                                       │
                                       ▼
                       SQLite (app.db) + storage/images  ──►  served at /static
```

The **backend is the orchestrator.** The flow for an AI turn:

> **receive message → ask the LLM (with tools) → if the LLM calls a tool, dispatch to ComfyUI → feed the result back to the LLM → return the final reply.**

A single **shared GPU lock** serialises all generation — whether it comes from chat or the workflow canvas — so the one physical GPU is only ever doing one job at a time.

---

## 🧠 The 4GB challenge — low-VRAM engineering

This is the star of the show. A real multimodal studio on 4GB VRAM isn't luck — it's a deliberate orchestration design where **at no instant are two diffusion/LLM models both resident.**

- 🧮 **The LLM runs on CPU** (Ollama), so it *never* competes with ComfyUI for VRAM.
- 🔁 **`OLLAMA_KEEP_ALIVE` is tied to where ComfyUI runs.** Local ComfyUI → unload the LLM immediately (`"0"`) to free **~3GB**. Remote ComfyUI → keep it warm (`"30m"`).
- 🎛️ **ComfyUI runs in default `--normalvram`** (smart VRAM/RAM split) — *not* `--lowvram`.
- 🧹 **The backend calls ComfyUI's `/free` after each local generation** to unload models and clear the GPU cache.
- 🔒 **A module-level `asyncio.Lock`** keeps the single GPU strictly one-job-at-a-time across chat and workflow.

> **Net result:** peak RAM ≈ `max(LLM, ComfyUI) + overhead` ≈ **7.5GB**. The two heavyweight models tag-team the GPU instead of brawling over it.

---

## 🛠️ Quickstart

**Prerequisites:** Python 3.11+, Node 18+, [Ollama](https://ollama.com) (with `qwen3:4b` pulled), and a running ComfyUI with the right models (**z-image-turbo** locally; **FLUX.1 Kontext / LTX-Video** remotely).

```bash
ollama pull qwen3:4b
```

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt

# copy .env.example to .env, then fill in:
#   JWT_SECRET, COMFY_BASE_URL, COMFY_BACKEND, OLLAMA_* etc.
cp .env.example .env        # Windows: copy .env.example .env

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

### Optional: scale up with a remote GPU

Run the notebook in `colab/`. It starts **ComfyUI + a Cloudflare quick tunnel** and prints a `COMFY_BASE_URL`. Paste it into `backend/.env`, set `COMFY_BACKEND=flux_kontext`, and restart the backend — you now have FLUX Kontext editing and LTX-Video, with no code changes.

The ComfyUI client is built for flaky tunnels: it auto-converts `http→ws` / `https→wss`, supports optional **Cloudflare Access** (Zero-Trust) service-token headers, **falls back to polling `/history`** if the WebSocket drops, and respects a configurable WS open-timeout.

---

## 🌐 Deployment modes

| | 🏠 100% local | ☁️ Hybrid / scale-up |
|---|---|---|
| **LLM** | Ollama `qwen3:4b` on CPU | Ollama `qwen3:4b` on CPU |
| **Image / video** | ComfyUI **z-image-turbo** on 4GB RTX 3050 | Remote ComfyUI: **FLUX.1 Kontext** + **LTX-Video** |
| **Connectivity** | Fully offline | Remote GPU via **Cloudflare tunnel** |
| **Editing power** | Style transfer / variations | True **instruction editing** + video |
| **How to switch** | default | Set `COMFY_BASE_URL` + `COMFY_BACKEND=flux_kontext`, restart |

---

## 📦 Tech stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, SQLite, JWT (python-jose) + bcrypt, httpx, websockets |
| **LLM** | Ollama, **qwen3:4b** (tool-calling) |
| **Image / video** | ComfyUI — **z-image-turbo** (GGUF Q4) local; **FLUX.1 Kontext** + **LTX-Video** on remote GPU |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, **@xyflow/react** (React Flow v12) |

---

## 🗺️ Roadmap

> ⚠️ **Not yet implemented — planned future work.**

- ☁️ **Cloud LLM text providers** (OpenAI-compatible, e.g. DashScope/Qwen), selectable per request.
- 🖼️ **Cloud image-generation** path.
- 💳 **Credits / quota system** for paid cloud usage.
- 👤 **Richer user / profile system.**

---

## ⚠️ Known limits

Honest constraints — by design, not by accident.

- **z-image img2img** is great for style transfer and variations but **weak at precise instruction edits.** That's exactly why **FLUX Kontext (remote)** exists as the upgrade path.
- **Local video generation isn't feasible on 4GB** — video runs on a roomier/remote GPU.
- **The job registry is in-process** (single Uvicorn worker) — perfect for this single-user / single-GPU design, but **not** multi-worker.

---

## 📁 Project structure

```
backend/
  app/
    main.py            # app entrypoint + wiring
    config.py          # env-driven settings
    auth/              # register/login, JWT
    chat/              # orchestrator (LLM ↔ tools ↔ ComfyUI)
    llm/               # ollama_client, tools, /llm/complete
    comfyui/           # client, injector, presets, workflows/*.json
    images/            # txt2img / img2img / i2v
    jobs/              # registry + cancel
    workflow/          # workflow CRUD
    db/                # models (5 tables incl. workflows)
  alembic/             # database migrations

frontend/
  app/
    chat/[id]          # chat view
    workflow/[id]      # workflow canvas view
    layout, icon.svg
  components/
    workflow/          # canvas, nodes
    JobsBar, AssetLibrary, AssetGalleryModal
    MessageBubble, MessageInput, sidebars
  lib/
    api                # backend client
    workflow/          # registry, engine
    mediaPresets, types

colab/                 # ComfyUI + Cloudflare tunnel notebook
docs/                  # PROJECT_OVERVIEW, architecture/end-to-end-flow
```

---

## 🎓 Credits

Built as a **graduation thesis (đồ án tốt nghiệp)** at **Hanoi University of Industry (HaUI)**, Computer Science.

Academic / educational project.
