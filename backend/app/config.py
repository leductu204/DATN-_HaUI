from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    database_url: str = "sqlite:///./app.db"

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:4b"

    comfy_base_url: str = "http://127.0.0.1:8188"
    comfy_timeout_seconds: float = 300.0
    # Video gen is much slower than image (LTX 2B distilled ~2-3 min on a T4,
    # longer on a busy tunnel). Give it a roomier ceiling than image.
    comfy_video_timeout_seconds: float = 600.0
    # LTX-Video i2v model picked by GPU VRAM: a roomy GPU (≥ threshold, e.g. L4
    # 24GB) runs the sharper 13B fp8; a smaller one (T4 16GB) falls back to 2B.
    # Both are all-in-one fp8 checkpoints → identical workflow, only the file
    # name changes.
    ltxv_vram_threshold_gb: float = 20.0
    ltxv_ckpt_13b: str = "ltxv-13b-0.9.8-distilled-fp8.safetensors"
    ltxv_ckpt_2b: str = "ltxv-2b-0.9.8-distilled-fp8.safetensors"
    # WebSocket connect timeout. Local ws:// is instant; a Cloudflare tunnel
    # (wss:// + TLS + edge routing) can legitimately take 8-12s, so default
    # generously. Bump higher if you see spurious "WebSocket error" on a tunnel.
    comfy_ws_open_timeout: float = 30.0
    # Optional Cloudflare Access (Zero Trust) service-token creds. Set both when
    # the ComfyUI tunnel is behind an Access policy, else every request 403s.
    # Left empty for a plain quick tunnel / local ComfyUI.
    comfy_cf_access_client_id: str = ""
    comfy_cf_access_client_secret: str = ""
    # "zimage" (local 4GB VRAM, z-image-turbo) or
    # "flux_kontext" (cloud GPU ≥10GB, FLUX.1 Kontext Q3_K_S, instruction-edit).
    comfy_backend: str = "zimage"

    @property
    def ollama_keep_alive(self) -> str:
        """How long Ollama keeps the model resident after replying.

        Tied to where ComfyUI runs: a LOCAL ComfyUI (zimage) shares the same
        4GB VRAM, so unload immediately ("0") to make room. A REMOTE ComfyUI
        (flux_kontext on Colab) leaves the local box free, so keep the model
        warm ("30m") and skip the ~10-15s cold-reload on every message.
        """
        return "0" if self.comfy_backend == "zimage" else "30m"


settings = Settings()
