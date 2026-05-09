import asyncio
import json
import uuid

import httpx
from websockets.asyncio.client import connect as ws_connect
from websockets.exceptions import WebSocketException

from app.config import settings

_HTTP_TIMEOUT = httpx.Timeout(30.0, read=120.0)


class ComfyError(Exception):
    pass


def _http_to_ws(url: str) -> str:
    if url.startswith("https://"):
        return "wss://" + url[len("https://"):]
    if url.startswith("http://"):
        return "ws://" + url[len("http://"):]
    return url


class ComfyClient:
    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.comfy_base_url).rstrip("/")
        self.client_id = uuid.uuid4().hex

    @property
    def ws_url(self) -> str:
        return f"{_http_to_ws(self.base_url)}/ws?clientId={self.client_id}"

    async def submit(self, workflow: dict) -> str:
        payload = {"prompt": workflow, "client_id": self.client_id}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.post(f"{self.base_url}/prompt", json=payload)
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

    async def wait(self, prompt_id: str, timeout_seconds: float = 300.0) -> None:
        try:
            async with ws_connect(self.ws_url, open_timeout=10) as ws:
                async with asyncio.timeout(timeout_seconds):
                    while True:
                        raw = await ws.recv()
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
            raise ComfyError(f"ComfyUI execution timed out after {timeout_seconds}s")
        except WebSocketException as e:
            raise ComfyError(f"ComfyUI WebSocket error: {e}") from e

    async def history(self, prompt_id: str) -> dict:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            try:
                resp = await client.get(f"{self.base_url}/history/{prompt_id}")
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
                resp = await client.get(f"{self.base_url}/view", params=params)
            except httpx.RequestError as e:
                raise ComfyError(f"Cannot reach ComfyUI: {e}") from e
        if resp.status_code != 200:
            raise ComfyError(f"ComfyUI /view returned HTTP {resp.status_code}")
        return resp.content

    async def generate(
        self,
        workflow: dict,
        output_node_id: str = "9",
        timeout_seconds: float = 300.0,
    ) -> bytes:
        prompt_id = await self.submit(workflow)
        await self.wait(prompt_id, timeout_seconds)
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
