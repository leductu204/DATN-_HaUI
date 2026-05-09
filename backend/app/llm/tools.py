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

TOOLS = [GENERATE_IMAGE]
