"""Tool schemas exposed to the LLM for function calling.

Format follows Ollama's tools spec, which mirrors OpenAI's function-call
schema, so the same definitions also work for Phase 5.5's QwenProvider via
the DashScope OpenAI-compatible endpoint.
"""

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
            },
            "required": ["target_prompt"],
        },
    },
}

TOOLS = [GENERATE_IMAGE, EDIT_IMAGE]
