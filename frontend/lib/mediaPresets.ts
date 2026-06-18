// Shared quality + aspect-ratio presets for the chat input and workflow nodes.
// Single source of truth so labels stay consistent across the app. The `value`
// strings must match the backend enums in app/comfyui/presets.py + schemas.py.

export type Preset = { value: string; label: string };

export const QUALITY_PRESETS: Preset[] = [
  { value: "draft", label: "Nháp — nhanh" },
  { value: "standard", label: "Tiêu chuẩn" },
  { value: "high", label: "Cao — nét, chậm" },
];

// Common social/display formats. `value` is the ratio the backend understands.
export const ASPECT_PRESETS: Preset[] = [
  { value: "1:1", label: "1:1 — Vuông (Instagram)" },
  { value: "16:9", label: "16:9 — Ngang (YouTube)" },
  { value: "9:16", label: "9:16 — Dọc (Story/TikTok)" },
  { value: "4:3", label: "4:3 — Ngang cổ điển" },
  { value: "3:4", label: "3:4 — Dọc cổ điển" },
  { value: "3:2", label: "3:2 — Ảnh ngang" },
  { value: "2:3", label: "2:3 — Poster dọc" },
];

// Short labels for tight UI (workflow node selects).
export const ASPECT_PRESETS_SHORT: Preset[] = ASPECT_PRESETS.map((p) => ({
  value: p.value,
  label: p.value,
}));
