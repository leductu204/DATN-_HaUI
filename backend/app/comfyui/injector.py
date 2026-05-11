import copy
import json
import random
from pathlib import Path

_WORKFLOW_DIR = Path(__file__).parent / "workflows"

# Node IDs that get patched per request. Shared by txt2img + img2img.
_PROMPT_NODE = "57:27"
_KSAMPLER_NODE = "57:3"
_LATENT_NODE = "57:13"  # txt2img only
_LOADIMAGE_NODE = "load_input"  # img2img only


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


def inject_img2img(
    workflow: dict,
    target_prompt: str,
    input_filename: str,
    strength: float = 0.65,
    seed: int | None = None,
) -> tuple[dict, int]:
    """Patch the img2img workflow with target prompt, input image filename,
    denoise strength, and seed.

    `strength` maps to KSampler.denoise. 0.0 keeps input unchanged, 1.0 ignores
    it (= txt2img). Practical range 0.4-0.8: lower preserves more of the
    original, higher applies more change.
    """
    resolved_seed = _resolve_seed(seed)
    strength = max(0.05, min(1.0, strength))
    wf = copy.deepcopy(workflow)
    wf[_PROMPT_NODE]["inputs"]["text"] = target_prompt
    wf[_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_KSAMPLER_NODE]["inputs"]["denoise"] = strength
    wf[_LOADIMAGE_NODE]["inputs"]["image"] = input_filename
    return wf, resolved_seed
