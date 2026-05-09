export type Provider = "ollama" | "qwen";

export type Conversation = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ToolCall = {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
};

export type Message = {
  id: number;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls: ToolCall[] | null;
  tool_call_id: string | null;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
};

export type User = {
  id: number;
  email: string;
  username: string;
  created_at: string;
};
