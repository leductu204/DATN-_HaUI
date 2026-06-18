// Node templates for the workflow builder. Pure data + helpers (no JSX) so it
// can be imported by both the canvas and the execution engine.

export type PortKind = "text" | "image" | "video" | "any";

export type PortDef = {
  id: string;
  kind: PortKind;
  label: string;
  // Hint only (not enforced at connect time): the node's primary input. Shown
  // with a "*" so users know what must be supplied.
  required?: boolean;
};

export type NodeTemplate = {
  type: string; // React Flow node type → renderer in components/workflow/nodes.tsx
  label: string;
  group: "io" | "ai";
  description: string;
  icon: string; // emoji shown in the palette + context menu
  inputs: PortDef[];
  outputs: PortDef[];
  // Initial node.data when dropped on the canvas.
  defaultData: Record<string, unknown>;
  // Disabled nodes appear in the palette but never execute (e.g. Video — chưa
  // hỗ trợ trên RTX 3050 4GB).
  disabled?: boolean;
};

export const NODE_TEMPLATES: Record<string, NodeTemplate> = {
  text: {
    type: "text",
    label: "Prompt",
    group: "io",
    icon: "📝",
    description: "Nhập prompt sẵn — nối thẳng vào Tạo ảnh/video (không gọi LLM).",
    inputs: [],
    outputs: [{ id: "out", kind: "text", label: "Prompt" }],
    defaultData: { value: "" },
  },
  upload: {
    type: "upload",
    label: "Tải ảnh lên",
    group: "io",
    icon: "🖼️",
    description: "Tải ảnh từ máy làm đầu vào.",
    inputs: [],
    outputs: [{ id: "out", kind: "image", label: "Ảnh" }],
    defaultData: {},
  },
  llm: {
    type: "llm",
    label: "Hỏi LLM (Qwen)",
    group: "ai",
    icon: "💬",
    description: "Nới/viết lại prompt bằng LLM. Gõ trong node hoặc nối Prompt vào.",
    inputs: [{ id: "in", kind: "text", label: "Nội dung" }],
    outputs: [{ id: "out", kind: "text", label: "Văn bản" }],
    defaultData: { prompt: "", system: "" },
  },
  image: {
    type: "image",
    label: "Tạo ảnh",
    group: "ai",
    icon: "🎨",
    description: "Tạo ảnh từ prompt; nối thêm ảnh gốc để chỉnh sửa (img2img).",
    inputs: [
      { id: "prompt", kind: "text", label: "Prompt", required: true },
      { id: "image", kind: "image", label: "Ảnh gốc" },
    ],
    outputs: [{ id: "result", kind: "image", label: "Ảnh" }],
    defaultData: {
      prompt: "",
      seed: null,
      quality: "standard",
      aspect_ratio: "1:1",
      count: 1,
    },
  },
  video: {
    type: "video",
    label: "Tạo video",
    group: "ai",
    icon: "🎬",
    description:
      "Tạo video ngắn từ một ảnh gốc (LTX-Video i2v). Nối ảnh vào và mô tả chuyển động.",
    inputs: [
      { id: "prompt", kind: "text", label: "Prompt" },
      { id: "image", kind: "image", label: "Ảnh gốc", required: true },
    ],
    outputs: [{ id: "result", kind: "video", label: "Video" }],
    defaultData: { prompt: "", quality: "standard", aspect_ratio: "16:9", count: 1 },
  },
  output: {
    type: "output",
    label: "Kết quả",
    group: "io",
    icon: "📤",
    description: "Hiển thị đầu ra của node nối vào.",
    inputs: [{ id: "in", kind: "any", label: "Đầu vào" }],
    outputs: [],
    defaultData: {},
  },
};

export const PALETTE: { title: string; group: NodeTemplate["group"] }[] = [
  { title: "Đầu vào / ra", group: "io" },
  { title: "AI", group: "ai" },
];

export function getTemplate(type: string): NodeTemplate | undefined {
  return NODE_TEMPLATES[type];
}

export function getPort(
  type: string,
  side: "inputs" | "outputs",
  portId: string | null | undefined,
): PortDef | undefined {
  const tpl = getTemplate(type);
  if (!tpl) return undefined;
  const ports = tpl[side];
  if (portId == null) return ports[0];
  return ports.find((p) => p.id === portId);
}

/** Two port kinds are compatible if equal or either side is "any". */
export function kindsCompatible(a: PortKind, b: PortKind): boolean {
  return a === b || a === "any" || b === "any";
}
