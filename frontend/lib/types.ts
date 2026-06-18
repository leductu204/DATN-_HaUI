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

export type ImageOut = {
  id: number;
  prompt: string;
  seed: number;
  url: string;
  created_at: string;
};

// An in-flight ComfyUI job (image/edit/video) tracked by the backend registry.
export type Job = {
  id: string;
  kind: "generate" | "edit" | "video";
  label: string;
  source: "chat" | "workflow";
  status: "queued" | "running";
  age_seconds: number;
};

// Sidebar list row — no graph payload.
export type WorkflowSummary = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

// React Flow graph persisted verbatim. `nodes`/`edges` match @xyflow/react.
export type WorkflowGraph = {
  nodes: unknown[];
  edges: unknown[];
  viewport?: { x: number; y: number; zoom: number };
};

export type Workflow = WorkflowSummary & {
  graph: WorkflowGraph;
};
