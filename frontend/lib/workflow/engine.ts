import { api } from "@/lib/api";
import type { ImageOut } from "@/lib/types";
import { getTemplate } from "./registry";

// Minimal graph shapes — a subset of @xyflow/react's Node/Edge that the engine
// needs. The canvas passes its real nodes/edges (structurally compatible).
export type GraphNode = {
  id: string;
  type?: string;
  data: Record<string, unknown>;
};

export type GraphEdge = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

// `all` carries every item when a node generated multiple (count 1-4). The
// top-level url/imageId is the FIRST — downstream nodes consume that one.
export type MediaItem = { url: string; imageId: number };
export type NodeResult =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; imageId: number; all?: MediaItem[] }
  | { kind: "video"; url: string; imageId: number; all?: MediaItem[] };

export type RunStatus = "idle" | "running" | "done" | "error" | "skipped";

export type StatusUpdate = (
  nodeId: string,
  status: RunStatus,
  extra?: { result?: NodeResult; error?: string; cached?: boolean },
) => void;

// Reused across Run clicks (same session) so unchanged nodes don't re-call the
// GPU. Keyed by node id → {key, result}; a changed input/config changes `key`.
export type ResultCache = Map<string, { key: string; result: NodeResult }>;

export class WorkflowRunError extends Error {
  constructor(
    public nodeId: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Kahn topological sort over the graph. Returns node ids in execution order.
 * Throws WorkflowRunError if the graph contains a cycle.
 */
export function topoSort(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    indegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (!indegree.has(e.source) || !indegree.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }
  const queue = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length !== nodes.length) {
    throw new WorkflowRunError("", "Workflow có vòng lặp — không thể chạy.");
  }
  return order;
}

function asText(r: NodeResult | undefined): string {
  return r && r.kind === "text" ? r.text : "";
}

/** Build a NodeResult from a list of generated media; first item is primary. */
function toMediaResult(outs: ImageOut[], kind: "image" | "video"): NodeResult {
  const all = outs.map((o) => ({ url: o.url, imageId: o.id }));
  const first = all[0];
  return { kind, url: first.url, imageId: first.imageId, all };
}

/**
 * Effective prompt for an Image node: a wired Prompt port overrides the node's
 * own field. Shared with the cache key so caching tracks the real input.
 */
function imagePrompt(node: GraphNode, inputs: Record<string, NodeResult>): string {
  const wired = asText(inputs.prompt).trim();
  const own = String(node.data.prompt ?? "").trim();
  return wired || own;
}

/** LLM content: a wired text input overrides the node's own typed field. */
function llmContent(node: GraphNode, inputs: Record<string, NodeResult>): string {
  const wired = asText(inputs.in).trim();
  const own = String(node.data.prompt ?? "").trim();
  return wired || own;
}

/**
 * Cache key capturing everything that affects a node's output. Returns null for
 * nodes we never cache (cheap passthroughs, or randomised image seeds).
 */
function cacheKey(
  node: GraphNode,
  inputs: Record<string, NodeResult>,
): string | null {
  switch (node.type) {
    case "llm":
      return `llm|${String(node.data.system ?? "")}|${llmContent(node, inputs)}`;
    case "image": {
      const seed = node.data.seed;
      if (typeof seed !== "number") return null; // random seed → always re-gen
      const count = Number(node.data.count ?? 1);
      if (count > 1) return null; // multiple = random seeds → always re-gen
      const ref = inputs.image?.kind === "image" ? inputs.image.imageId : "";
      const q = String(node.data.quality ?? "");
      const ar = String(node.data.aspect_ratio ?? "");
      return `image|${imagePrompt(node, inputs)}|${ref}|${seed}|${q}|${ar}`;
    }
    default:
      return null;
  }
}

async function evalNode(
  node: GraphNode,
  inputs: Record<string, NodeResult>,
  wired: Set<string>,
): Promise<NodeResult | undefined> {
  const type = node.type ?? "";
  switch (type) {
    case "text":
      return { kind: "text", text: String(node.data.value ?? "") };

    case "upload": {
      const url = node.data.url as string | undefined;
      const imageId = node.data.imageId as number | undefined;
      if (!url || imageId == null) {
        throw new Error("Node Tải ảnh chưa có ảnh.");
      }
      return { kind: "image", url, imageId };
    }

    case "llm": {
      if (wired.has("in") && !inputs.in) {
        throw new Error("Node phía trước không có kết quả (lỗi hoặc bị bỏ qua).");
      }
      const prompt = llmContent(node, inputs);
      if (!prompt) throw new Error("Node LLM thiếu nội dung.");
      const system = String(node.data.system ?? "").trim() || undefined;
      const resp = await api<{ content: string }>("/llm/complete", {
        method: "POST",
        body: JSON.stringify({ prompt, system }),
      }, { timeoutMs: 180_000 });
      return { kind: "text", text: resp.content };
    }

    case "image": {
      // A wired-but-unresolved input means an upstream node failed or was
      // skipped — fail loudly instead of silently degrading the output.
      if (wired.has("prompt") && !inputs.prompt) {
        throw new Error("Prompt nối vào không có kết quả (node trước lỗi/bị bỏ qua).");
      }
      if (wired.has("image") && !inputs.image) {
        throw new Error("Ảnh gốc nối vào không có kết quả (node trước lỗi/bị bỏ qua).");
      }
      const prompt = imagePrompt(node, inputs);
      if (!prompt) throw new Error("Node Tạo ảnh thiếu prompt.");

      const quality = String(node.data.quality || "standard");
      const aspectRatio = String(node.data.aspect_ratio || "1:1");
      const count = Math.max(1, Math.min(4, Number(node.data.count ?? 1)));
      const ref = inputs.image;
      if (ref && ref.kind === "image") {
        const outs = await api<ImageOut[]>("/images/edit", {
          method: "POST",
          body: JSON.stringify({
            image_id: ref.imageId,
            prompt,
            quality,
            aspect_ratio: aspectRatio,
            count,
          }),
        }, { timeoutMs: 600_000 });
        return toMediaResult(outs, "image");
      }
      const seed = node.data.seed;
      const outs = await api<ImageOut[]>("/images/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          seed: typeof seed === "number" ? seed : null,
          quality,
          aspect_ratio: aspectRatio,
          count,
        }),
      }, { timeoutMs: 600_000 });
      return toMediaResult(outs, "image");
    }

    case "video": {
      if (wired.has("image") && !inputs.image) {
        throw new Error("Ảnh gốc nối vào không có kết quả (node trước lỗi/bị bỏ qua).");
      }
      const ref = inputs.image;
      if (!ref || ref.kind !== "image") {
        throw new Error("Node Tạo video cần một ảnh gốc nối vào.");
      }
      const prompt = imagePrompt(node, inputs);
      if (!prompt) throw new Error("Node Tạo video thiếu prompt mô tả chuyển động.");
      const count = Math.max(1, Math.min(4, Number(node.data.count ?? 1)));
      const outs = await api<ImageOut[]>(
        "/images/video",
        {
          method: "POST",
          body: JSON.stringify({
            image_id: ref.imageId,
            prompt,
            quality: String(node.data.quality || "standard"),
            aspect_ratio: String(node.data.aspect_ratio || "16:9"),
            count,
          }),
        },
        { timeoutMs: 1_200_000 },
      );
      return toMediaResult(outs, "video");
    }

    case "output":
      // Passthrough — the result is surfaced via the status update so the
      // Output node can render it.
      return inputs.in;

    default:
      return undefined;
  }
}

/**
 * Execute the graph in topological order. Each node's inputs are resolved from
 * already-computed upstream results. Runs sequentially — fits the single-GPU
 * (RTX 3050 4GB) constraint where ComfyUI/Ollama can't run in parallel.
 *
 * Pass a `cache` to reuse unchanged nodes' results across Run clicks (skips
 * re-generating an image whose prompt/seed/reference didn't change).
 *
 * Stops on the first failing node and throws WorkflowRunError; nodes already
 * completed keep their results.
 */
export async function runGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  onStatus: StatusUpdate,
  cache?: ResultCache,
  reuse?: { forceId: string; results: Map<string, NodeResult> },
): Promise<Map<string, NodeResult>> {
  const order = topoSort(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const results = new Map<string, NodeResult>();

  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    const tpl = getTemplate(node.type ?? "");

    if (tpl?.disabled) {
      onStatus(id, "skipped");
      continue;
    }

    // Per-node run: reuse an ancestor's previous result instead of recomputing
    // it (so running the Output node doesn't re-generate an upstream image
    // that already has a result). The clicked target node still runs fresh.
    if (reuse && id !== reuse.forceId && reuse.results.has(id)) {
      const prev = reuse.results.get(id)!;
      results.set(id, prev);
      onStatus(id, "done", { result: prev, cached: true });
      continue;
    }

    const wired = new Set<string>();
    const inputs: Record<string, NodeResult> = {};
    for (const e of edges) {
      if (e.target !== id) continue;
      const handle = e.targetHandle ?? "in";
      wired.add(handle);
      const src = results.get(e.source);
      if (src) inputs[handle] = src;
    }

    const key = cache ? cacheKey(node, inputs) : null;
    if (cache && key) {
      const hit = cache.get(id);
      if (hit && hit.key === key) {
        results.set(id, hit.result);
        onStatus(id, "done", { result: hit.result, cached: true });
        continue;
      }
    }

    onStatus(id, "running");
    try {
      const out = await evalNode(node, inputs, wired);
      if (out) {
        results.set(id, out);
        if (cache && key) cache.set(id, { key, result: out });
      }
      onStatus(id, "done", { result: out });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      onStatus(id, "error", { error: msg });
      throw new WorkflowRunError(id, msg);
    }
  }
  return results;
}
