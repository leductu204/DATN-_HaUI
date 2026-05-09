import copy
import json
import random
from pathlib import Path

_WORKFLOW_DIR = Path(__file__).parent / "workflows"

# Node IDs in txt2img_zimage.json that get patched per request.
_PROMPT_NODE = "57:27"
_KSAMPLER_NODE = "57:3"
_LATENT_NODE = "57:13"


def load_workflow(name: str) -> dict:
    path = _WORKFLOW_DIR / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_seed(seed: int | None) -> int:
    if seed is None or seed < 0:
        # SQLite stores signed 64-bit ints; cap below 2**63 to be safe.
        return random.randint(0, 2**63 - 1)
    return seed


def inject_txt2img(
    workflow: dict,
    prompt: str,
    seed: int | None = None,
    width: int = 512,
    height: int = 512,
) -> tuple[dict, int]:
    resolved_seed = _resolve_seed(seed)
    wf = copy.deepcopy(workflow)
    wf[_PROMPT_NODE]["inputs"]["text"] = prompt
    wf[_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_LATENT_NODE]["inputs"]["width"] = width
    wf[_LATENT_NODE]["inputs"]["height"] = height
    return wf, resolved_seed
