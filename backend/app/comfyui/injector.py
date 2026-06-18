import copy
import json
import random
from pathlib import Path

_WORKFLOW_DIR = Path(__file__).parent / "workflows"

# z-image node IDs
_Z_PROMPT_NODE = "57:27"
_Z_KSAMPLER_NODE = "57:3"
_Z_LATENT_NODE = "57:13"
_Z_LOADIMAGE_NODE = "load_input"

# FLUX Kontext node IDs (see workflows/*_flux_kontext.json)
_F_PROMPT_NODE = "4"
_F_KSAMPLER_NODE = "8"
_F_LATENT_NODE = "7"
_F_LOADIMAGE_NODE = "load_input"

# LTX-Video i2v node IDs (see workflows/i2v_ltxv.json)
_LTX_PROMPT_NODE = "pos"
_LTX_LOADIMAGE_NODE = "load_input"
_LTX_SAMPLER_NODE = "sampler"
_LTX_I2V_NODE = "i2v"
_LTX_SCHEDULER_NODE = "scheduler"
_LTX_CKPT_NODE = "ckpt"


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
    wf[_Z_PROMPT_NODE]["inputs"]["text"] = prompt
    wf[_Z_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_Z_LATENT_NODE]["inputs"]["width"] = width
    wf[_Z_LATENT_NODE]["inputs"]["height"] = height
    return wf, resolved_seed


def inject_img2img(
    workflow: dict,
    target_prompt: str,
    input_filename: str,
    strength: float = 0.65,
    seed: int | None = None,
) -> tuple[dict, int]:
    """Patch the z-image img2img workflow.

    `strength` maps to KSampler.denoise. 0.0 keeps input unchanged, 1.0 ignores
    it (= txt2img). Practical range 0.4-0.8: lower preserves more of the
    original, higher applies more change.
    """
    resolved_seed = _resolve_seed(seed)
    strength = max(0.05, min(1.0, strength))
    wf = copy.deepcopy(workflow)
    wf[_Z_PROMPT_NODE]["inputs"]["text"] = target_prompt
    wf[_Z_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_Z_KSAMPLER_NODE]["inputs"]["denoise"] = strength
    wf[_Z_LOADIMAGE_NODE]["inputs"]["image"] = input_filename
    return wf, resolved_seed


def inject_txt2img_flux(
    workflow: dict,
    prompt: str,
    seed: int | None = None,
    width: int = 768,
    height: int = 768,
    steps: int | None = None,
) -> tuple[dict, int]:
    resolved_seed = _resolve_seed(seed)
    wf = copy.deepcopy(workflow)
    wf[_F_PROMPT_NODE]["inputs"]["text"] = prompt
    wf[_F_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_F_LATENT_NODE]["inputs"]["width"] = width
    wf[_F_LATENT_NODE]["inputs"]["height"] = height
    if steps is not None:
        wf[_F_KSAMPLER_NODE]["inputs"]["steps"] = steps
    return wf, resolved_seed


def inject_img2img_flux(
    workflow: dict,
    target_prompt: str,
    input_filename: str,
    seed: int | None = None,
    width: int | None = None,
    height: int | None = None,
    steps: int | None = None,
) -> tuple[dict, int]:
    """Patch the FLUX Kontext img2img workflow.

    FLUX Kontext is an instruction-edit model: the source image is fed via
    ReferenceLatent as conditioning, not as a denoise seed, so there is no
    `strength` knob — denoise stays at 1.0. The LLM should write the FULL
    description of the desired output as the prompt. `width`/`height` resize
    the reference (via the image_scale node) so the output matches the
    requested aspect ratio.
    """
    resolved_seed = _resolve_seed(seed)
    wf = copy.deepcopy(workflow)
    wf[_F_PROMPT_NODE]["inputs"]["text"] = target_prompt
    wf[_F_KSAMPLER_NODE]["inputs"]["seed"] = resolved_seed
    wf[_F_LOADIMAGE_NODE]["inputs"]["image"] = input_filename
    if width is not None and "image_scale" in wf:
        wf["image_scale"]["inputs"]["width"] = width
    if height is not None and "image_scale" in wf:
        wf["image_scale"]["inputs"]["height"] = height
    if steps is not None:
        wf[_F_KSAMPLER_NODE]["inputs"]["steps"] = steps
    return wf, resolved_seed


def inject_i2v_ltxv(
    workflow: dict,
    motion_prompt: str,
    input_filename: str,
    seed: int | None = None,
    width: int | None = None,
    height: int | None = None,
    steps: int | None = None,
    length: int | None = None,
    ckpt_name: str | None = None,
) -> tuple[dict, int]:
    """Patch the LTX-Video i2v workflow: source image + a motion/scene prompt
    describing how it should animate. SamplerCustom uses noise_seed (not seed).
    width/height/length set the output clip dims + frame count; steps the
    scheduler resolution. `ckpt_name` swaps the model (2B vs 13B) — both are
    all-in-one fp8 checkpoints so the graph is identical.
    """
    resolved_seed = _resolve_seed(seed)
    wf = copy.deepcopy(workflow)
    wf[_LTX_PROMPT_NODE]["inputs"]["text"] = motion_prompt
    wf[_LTX_LOADIMAGE_NODE]["inputs"]["image"] = input_filename
    wf[_LTX_SAMPLER_NODE]["inputs"]["noise_seed"] = resolved_seed
    if width is not None:
        wf[_LTX_I2V_NODE]["inputs"]["width"] = width
    if height is not None:
        wf[_LTX_I2V_NODE]["inputs"]["height"] = height
    if length is not None:
        wf[_LTX_I2V_NODE]["inputs"]["length"] = length
    if steps is not None:
        wf[_LTX_SCHEDULER_NODE]["inputs"]["steps"] = steps
    if ckpt_name is not None:
        wf[_LTX_CKPT_NODE]["inputs"]["ckpt_name"] = ckpt_name
    return wf, resolved_seed
