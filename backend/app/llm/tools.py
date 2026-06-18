"""Tool schemas exposed to the LLM for function calling.

Format follows Ollama's tools spec, which mirrors OpenAI's function-call
schema, so the same definitions also work for Phase 5.5's QwenProvider via
the DashScope OpenAI-compatible endpoint.
"""

# Shared optional knobs the LLM should infer from the user's request. Reused by
# all media tools so quality/aspect can be picked per-request ("ảnh ngang nét").
_QUALITY_PROP = {
    "type": "string",
    "enum": ["draft", "standard", "high"],
    "description": (
        "Output quality. Infer from the user's words: 'high'/'cao'/'nét'/'4k' "
        "-> high; 'nhanh'/'nháp'/'thử' -> draft; otherwise omit (defaults to "
        "standard). Higher = sharper but slower."
    ),
}
_ASPECT_PROP = {
    "type": "string",
    "enum": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    "description": (
        "Aspect ratio. Infer from the request: landscape/'ngang'/wallpaper "
        "-> 16:9; portrait/'dọc'/phone -> 9:16; omit for square 1:1."
    ),
}
_COUNT_PROP = {
    "type": "integer",
    "minimum": 1,
    "maximum": 4,
    "description": (
        "How many to create (1-4). Infer from the request: '4 ảnh'/'vài tấm' "
        "-> 4, '2 cái' -> 2; omit for a single one."
    ),
}

GENERATE_IMAGE = {
    "type": "function",
    "function": {
        "name": "generate_image",
        "description": (
            "Generate an image from a text description. Call this ONLY when "
            "the user explicitly asks to draw, create, render, or generate "
            "an image. Do not call it for general questions or chat."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": (
                        "Detailed visual description of the image to generate. "
                        "Include subject, style, colors, composition, lighting. "
                        "May be in Vietnamese or English."
                    ),
                },
                "seed": {
                    "type": "integer",
                    "description": (
                        "Optional seed for reproducibility. Omit or pass -1 "
                        "for a random seed."
                    ),
                },
                "quality": _QUALITY_PROP,
                "aspect_ratio": _ASPECT_PROP,
                "count": _COUNT_PROP,
            },
            "required": ["prompt"],
        },
    },
}

EDIT_IMAGE = {
    "type": "function",
    "function": {
        "name": "edit_image",
        "description": (
            "Edit the user's most recent image. Call this when the user "
            "asks to modify, restyle, transform, or regenerate an image "
            "that was previously created in this conversation. Do NOT "
            "call generate_image for these requests."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "target_prompt": {
                    "type": "string",
                    "description": (
                        "FULL description of the desired output image — "
                        "subject + style + setting. Do NOT phrase as an "
                        "instruction (\"change X to Y\"). Example: user "
                        "says \"make it anime\" referring to a cat photo, "
                        "target_prompt = \"anime style fluffy orange cat "
                        "sitting on windowsill, vibrant anime art, cel "
                        "shading\". Translate user's Vietnamese into "
                        "English-style descriptive prompt for best results."
                    ),
                },
                "strength": {
                    "type": "number",
                    "description": (
                        "How much to change the source image. Range "
                        "0.4-0.8. Lower (~0.45) preserves more of the "
                        "original — use for subtle edits like color "
                        "tweaks. Higher (~0.75) applies more change — "
                        "use for style transfer or major restyling. "
                        "Default 0.65 if unsure."
                    ),
                },
                "quality": _QUALITY_PROP,
                "aspect_ratio": _ASPECT_PROP,
                "count": _COUNT_PROP,
            },
            "required": ["target_prompt"],
        },
    },
}

GENERATE_VIDEO = {
    "type": "function",
    "function": {
        "name": "generate_video",
        "description": (
            "Animate the user's most recent image into a short video clip. "
            "Call this when the user asks to animate, make a video from, bring "
            "to life, or add motion to an image already in this conversation "
            "(\"make it move\", \"tạo video từ ảnh này\", \"cho nó chuyển động\"). "
            "Requires an existing image — do NOT call it if none was created or "
            "uploaded yet."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "motion_prompt": {
                    "type": "string",
                    "description": (
                        "Describe the motion / camera movement / scene "
                        "dynamics for the clip, in descriptive English. "
                        "Example: \"the cat slowly blinks and turns its head, "
                        "gentle camera push-in, soft natural light\". Translate "
                        "the user's Vietnamese request into an English motion "
                        "description."
                    ),
                },
                "quality": _QUALITY_PROP,
                "aspect_ratio": _ASPECT_PROP,
                "count": _COUNT_PROP,
            },
            "required": ["motion_prompt"],
        },
    },
}

TOOLS = [GENERATE_IMAGE, EDIT_IMAGE, GENERATE_VIDEO]
