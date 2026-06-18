from pydantic import BaseModel, Field


class LLMCompleteRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    # Optional system instruction — e.g. "Rewrite this into a detailed English
    # image prompt." Lets a workflow LLM node specialise without conversation state.
    system: str | None = Field(default=None, max_length=4000)


class LLMCompleteResponse(BaseModel):
    content: str
