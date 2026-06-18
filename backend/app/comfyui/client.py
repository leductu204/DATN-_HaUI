import asyncio
import json
import uuid
from collections.abc import Callable

import httpx
from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import WebSocketException

from app.config import settings

_HTTP_TIMEOUT = httpx.Timeout(30.0, read=120.0)

# Single in-process GPU. ComfyUI runs one diffusion job at a time on a 4GB card,
# and chat tool-calls + the workflow canvas can both dispatch generations
# concurrently. Serialise every generate() so two requests never fight over VRAM
# (→ OOM / pagefile thrash). Module-level → shared across all ComfyClient
# instances in the process.
_GPU_LOCK = asyncio.Lock()


class ComfyError(Exception):
    pass


class ComfyCancelled(ComfyError):
    """Raised when a job is cancelled by the user (via the jobs registry)."""

    pass


def _http_to_ws(url: str) -> str:
    if url.startswith("https://"):
        return "wss://" + url[len("https://"):]
    if url.startswith("http://"):
        return "ws://" + url[len("http://"):]
    return url


def _auth_headers() -> dict[str, str]:
    """Cloudflare Access service-token headers, if configured. Empty for a plain
    quick tunnel / local ComfyUI."""
    cid = settings.comfy_cf_access_client_id
    secret = settings.comfy_cf_access_client_secret
    if cid and secret:
        return {"CF-Access-Client-Id": cid, "CF-Access-Client-Secret": secret}
    return {}


class ComfyClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.comfy_base_url).rstrip("/")
        self.client_id = uuid.uuid4().hex
        self._headers = _auth_headers()

    @property
    def ws_url(self) -> str:
        return f"{_http_to_ws(self.base_url)}/ws?clientId={self.client_id}"

    async def upload_image(self, image_bytes: bytes, name: str) -> str:
        """Upload an image to ComfyUI's input/ folder. Returns the saved
        filename (ComfyUI may sanitise or deduplicate; trust its response).
        """
        files = {"image": (name, image_bytes, "image/png")}
        data = {"overwrite": "true", "type": "input"}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/upload/image",
                    files=files,
                    data=data,
                    headers=self._headers,
                )
            except httpx.RequestError as e:
                raise ComfyError(
                    f"Cannot reach ComfyUI at {self.base_url}: {e}"
                ) from e
        if resp.status_code != 200:
            raise ComfyError(
                f"ComfyUI /upload/image returned HTTP {resp.status_code}: "
                f"{resp.text[:300]}"
            )
        body = resp.json()
        saved = body.get("name")
        if not saved:
            raise ComfyError(f"No filename in /upload/image response: {body}")
        return saved

    async def total_vram_gb(self) -> float | None:
        """Total VRAM of the ComfyUI GPU in GB, or None if unreachable. Used to
        pick a model variant (T4 16GB GGUF vs L4 24GB fp8). Total (not free) is
        stable regardless of what's currently loaded."""
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                resp = await client.get(
                    f"{self.base_url}/system_stats", headers=self._headers
                )
            if resp.status_code != 200:
                return None
            devices = resp.json().get("devices") or []
            if not devices:
                return None
            total = devices[0].get("vram_total")
            return total / 1e9 if total else None
        except Exception:
            return None

    async def submit(self, workflow: dict) -> str:
        payload = {"prompt": workflow, "client_id": self.client_id}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/prompt", json=payload, headers=self._headers
                )
            except httpx.RequestError as e:
                raise ComfyError(f"Cannot reach ComfyUI at {self.base_url}: {e}") from e
        if resp.status_code != 200:
            raise ComfyError(
                f"ComfyUI /prompt returned HTTP {resp.status_code}: {resp.text[:300]}"
            )
        prompt_id = resp.json().get("prompt_id")
        if not prompt_id:
            raise ComfyError(f"No prompt_id in /prompt response: {resp.text[:300]}")
        return prompt_id

    async def _is_done(self, prompt_id: str) -> bool:
        """True once ComfyUI lists this prompt in /history (i.e. it finished).
        Running/queued prompts are NOT in /history yet."""
        try:
            data = await self.history(prompt_id)
        except ComfyError:
            return False
        return bool(data.get(prompt_id))

    async def _wait_via_history(self, prompt_id: str, timeout_seconds: float) -> bool:
        """Fallback when the WS is unusable (dropped / refused over a flaky
        tunnel): poll /history until the job appears or we hit the timeout."""
        try:
            async with asyncio.timeout(timeout_seconds):
                while True:
                    if await self._is_done(prompt_id):
                        return True
                    await asyncio.sleep(2)
        except asyncio.TimeoutError:
            return False

    async def wait(
        self,
        prompt_id: str,
        timeout_seconds: float = 300.0,
        cancel_event: asyncio.Event | None = None,
    ) -> None:
        try:
            async with ws_connect(
                self.ws_url,
                open_timeout=settings.comfy_ws_open_timeout,
                additional_headers=self._headers or None,
            ) as ws:
                # The job can finish during a (tunnel-slow) WS handshake, so its
                # completion event is missed. Check /history once up front so we
                # never block to the full timeout on an already-done job.
                if await self._is_done(prompt_id):
                    return
                async with asyncio.timeout(timeout_seconds):
                    while True:
                        if cancel_event is not None and cancel_event.is_set():
                            raise ComfyCancelled("Job đã bị huỷ.")
                        try:
                            # 1s poll so we notice cancellation promptly even
                            # while no WS message arrives.
                            raw = await asyncio.wait_for(ws.recv(), timeout=1.0)
                        except asyncio.TimeoutError:
                            continue
                        if isinstance(raw, (bytes, bytearray)):
                            # Binary preview frames during execution — skip.
                            continue
                        msg = json.loads(raw)
                        mtype = msg.get("type")
                        data = msg.get("data") or {}
                        if mtype == "execution_error" and data.get("prompt_id") == prompt_id:
                            raise ComfyError(
                                f"ComfyUI execution_error: "
                                f"{data.get('exception_message', data)}"
                            )
                        if (
                            mtype == "executing"
                            and data.get("node") is None
                            and data.get("prompt_id") == prompt_id
                        ):
                            return
        except asyncio.TimeoutError:
            # Maybe it finished and we missed the completion event — confirm.
            if await self._is_done(prompt_id):
                return
            raise ComfyError(f"ComfyUI execution timed out after {timeout_seconds}s")
        except WebSocketException as e:
            # WS dropped / refused (common over a flaky tunnel). The job may
            # still be running on ComfyUI — fall back to polling /history.
            if await self._wait_via_history(prompt_id, timeout_seconds):
                return
            raise ComfyError(f"ComfyUI WebSocket error: {e}") from e

    async def history(self, prompt_id: str) -> dict:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.get(
                    f"{self.base_url}/history/{prompt_id}", headers=self._headers
                )
            except httpx.RequestError as e:
                raise ComfyError(f"Cannot reach ComfyUI: {e}") from e
        if resp.status_code != 200:
            raise ComfyError(f"ComfyUI /history returned HTTP {resp.status_code}")
        return resp.json()

    async def fetch_image(
        self, filename: str, subfolder: str = "", type_: str = "output"
    ) -> bytes:
        params = {"filename": filename, "subfolder": subfolder, "type": type_}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.get(
                    f"{self.base_url}/view", params=params, headers=self._headers
                )
            except httpx.RequestError as e:
                raise ComfyError(f"Cannot reach ComfyUI: {e}") from e
        if resp.status_code != 200:
            raise ComfyError(f"ComfyUI /view returned HTTP {resp.status_code}")
        return resp.content

    async def free(self) -> None:
        """Ask ComfyUI to unload all models from VRAM + RAM.

        Best-effort: swallow errors since the main generation has either
        already succeeded or already raised. Without this, two different
        diffusion models (txt2img + img2img edit) compete for the user's
        4GB VRAM / 7GB free RAM and trigger pagefile swap.
        """
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                await client.post(
                    f"{self.base_url}/free",
                    json={"unload_models": True, "free_memory": True},
                    headers=self._headers,
                )
        except Exception:
            pass

    async def interrupt(self) -> None:
        """Best-effort: ask ComfyUI to stop the currently-running prompt."""
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
                await client.post(
                    f"{self.base_url}/interrupt", headers=self._headers
                )
        except Exception:
            pass

    @staticmethod
    def _find_media(outputs: dict) -> tuple[dict, str] | None:
        """Scan every output node for a saved media entry. ComfyUI puts images
        under "images", but video save nodes use "gifs"/"videos" (and the build
        varies), so check all known keys. Returns (entry, kind) where kind is
        "video" if the filename looks like a video, else "image"."""
        video_exts = (".mp4", ".webm", ".mov", ".mkv", ".gif")
        for node_output in outputs.values():
            for key in ("images", "gifs", "videos"):
                items = node_output.get(key) or []
                if items:
                    entry = items[0]
                    fn = (entry.get("filename") or "").lower()
                    kind = "video" if fn.endswith(video_exts) else "image"
                    return entry, kind
        return None

    async def generate_video(
        self,
        workflow: dict,
        timeout_seconds: float = 600.0,
        free_after: bool = True,
        cancel_event: asyncio.Event | None = None,
        on_submit: Callable[[str], None] | None = None,
    ) -> tuple[bytes, str]:
        """Run a video workflow and return (raw_bytes, file_extension).

        Unlike generate(), this does not assume node id "9" or the "images"
        output key — it scans all outputs for the first media entry (video save
        nodes report under "gifs"/"videos"). Holds the GPU lock like generate().
        """
        async with _GPU_LOCK:
            try:
                if cancel_event is not None and cancel_event.is_set():
                    raise ComfyCancelled("Job đã bị huỷ trước khi chạy.")
                prompt_id = await self.submit(workflow)
                if on_submit is not None:
                    on_submit(prompt_id)
                await self.wait(prompt_id, timeout_seconds, cancel_event=cancel_event)
                history = await self.history(prompt_id)
                entry = history.get(prompt_id) or {}
                outputs = entry.get("outputs") or {}
                found = self._find_media(outputs)
                if found is None:
                    raise ComfyError(
                        f"No media output found. Outputs keys: {list(outputs.keys())}"
                    )
                info, _kind = found
                filename = info["filename"]
                ext = ("." + filename.rsplit(".", 1)[-1]) if "." in filename else ".mp4"
                data = await self.fetch_image(
                    filename=filename,
                    subfolder=info.get("subfolder", ""),
                    type_=info.get("type", "output"),
                )
                return data, ext
            finally:
                if free_after:
                    await self.free()

    async def generate(
        self,
        workflow: dict,
        output_node_id: str = "9",
        timeout_seconds: float = 300.0,
        free_after: bool = True,
        cancel_event: asyncio.Event | None = None,
        on_submit: Callable[[str], None] | None = None,
    ) -> bytes:
        """`free_after=True` (default) unloads models after each request — needed
        when VRAM is tight (local 4GB) and txt2img/img2img use different models.
        Set False on roomy GPUs (cloud 12-16GB, single model loaded once) to keep
        weights warm and skip ~120s reload between requests.

        The whole submit→wait→fetch→free sequence holds `_GPU_LOCK` so concurrent
        callers (chat + workflow) run strictly one at a time on the single GPU.
        """
        async with _GPU_LOCK:
            try:
                if cancel_event is not None and cancel_event.is_set():
                    raise ComfyCancelled("Job đã bị huỷ trước khi chạy.")
                prompt_id = await self.submit(workflow)
                if on_submit is not None:
                    on_submit(prompt_id)
                await self.wait(prompt_id, timeout_seconds, cancel_event=cancel_event)
                history = await self.history(prompt_id)
                entry = history.get(prompt_id) or {}
                outputs = entry.get("outputs") or {}
                node_output = outputs.get(output_node_id) or {}
                images = node_output.get("images") or []
                if not images:
                    raise ComfyError(
                        f"No images at output node {output_node_id}. "
                        f"Outputs keys: {list(outputs.keys())}"
                    )
                img_info = images[0]
                return await self.fetch_image(
                    filename=img_info["filename"],
                    subfolder=img_info.get("subfolder", ""),
                    type_=img_info.get("type", "output"),
                )
            finally:
                if free_after:
                    await self.free()
