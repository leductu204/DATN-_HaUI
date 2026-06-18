"use client";

import { useState } from "react";
import {
  Handle,
  Position,
  useNodeConnections,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { api, API_BASE_URL } from "@/lib/api";
import type { ImageOut } from "@/lib/types";
import { getTemplate, type PortDef, type PortKind } from "@/lib/workflow/registry";
import { QUALITY_PRESETS, ASPECT_PRESETS_SHORT } from "@/lib/mediaPresets";
import type { NodeResult } from "@/lib/workflow/engine";
import { useNodeRunInfo, useWorkflowRuntime } from "./WorkflowContext";

const STATUS_DOT: Record<string, string> = {
  idle: "bg-slate-300 dark:bg-slate-600",
  running: "bg-amber-400 animate-pulse",
  done: "bg-emerald-500",
  error: "bg-red-500",
  skipped: "bg-slate-400",
};

// Handle colour (needs !important to beat the xyflow default handle styles).
const KIND_COLOR: Record<PortKind, string> = {
  text: "!bg-sky-500",
  image: "!bg-violet-500",
  video: "!bg-orange-500",
  any: "!bg-slate-400",
};

// Small legend dot shown next to each port label (no !important needed).
const KIND_DOT: Record<PortKind, string> = {
  text: "bg-sky-500",
  image: "bg-violet-500",
  video: "bg-orange-500",
  any: "bg-slate-400",
};

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
  );
}

/**
 * One port = one full-width row. The <Handle> stays absolutely positioned (its
 * xyflow default) but we wrap it in a `relative` row, so it anchors to the
 * row's edge and is vertically centred on THIS row instead of the whole node.
 * That keeps the dot on the border, aligned to its label, and stops labels from
 * overlapping the node's fields.
 */
function PortRow({ port, side }: { port: PortDef; side: "target" | "source" }) {
  const isInput = side === "target";
  return (
    <div className="relative flex items-center py-1">
      <Handle
        id={port.id}
        type={side}
        position={isInput ? Position.Left : Position.Right}
        className={`!h-4 !w-4 !border-2 !border-white dark:!border-slate-900 hover:!scale-125 !transition-transform !cursor-crosshair ${KIND_COLOR[port.kind]}`}
      />
      <span
        className={`flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-300 ${
          isInput ? "pl-3.5" : "ml-auto pr-3.5"
        }`}
      >
        {!isInput && (
          <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[port.kind]}`} />
        )}
        <span>
          {port.label}
          {port.required && <span className="text-red-400">&nbsp;*</span>}
        </span>
        {isInput && (
          <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[port.kind]}`} />
        )}
      </span>
    </div>
  );
}

function NodeShell({
  id,
  nodeType,
  selected,
  children,
}: {
  id: string;
  nodeType: string;
  selected?: boolean;
  children: React.ReactNode;
}) {
  const tpl = getTemplate(nodeType);
  const info = useNodeRunInfo(id);
  const { deleteNode, runNode } = useWorkflowRuntime();
  if (!tpl) return null;

  const borderClass = selected
    ? "border-blue-500 ring-2 ring-blue-500/40"
    : info.status === "error"
      ? "border-red-400 dark:border-red-600"
      : info.status === "running"
        ? "border-amber-400"
        : "border-slate-200 dark:border-slate-700";

  return (
    <div
      className={`relative rounded-xl border bg-white dark:bg-slate-900 shadow-sm w-72 text-slate-800 dark:text-slate-100 ${borderClass}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        {info.status === "running" ? (
          <Spinner />
        ) : (
          <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[info.status]}`} />
        )}
        <span className="text-xs font-semibold truncate flex-1">{tpl.label}</span>
        {info.cached && (
          <span className="text-[9px] text-slate-400" title="Tái dùng kết quả cũ">
            cache
          </span>
        )}
        {(tpl.group === "ai" || nodeType === "output") && (
          <button
            type="button"
            onClick={() => runNode(id)}
            title="Chạy node này (kèm các node phía trước)"
            className="nodrag text-emerald-600 hover:text-emerald-500 text-xs leading-none px-1"
          >
            ▶
          </button>
        )}
        <button
          type="button"
          onClick={() => deleteNode(id)}
          title="Xoá node"
          className="nodrag text-slate-400 hover:text-red-500 text-xs leading-none px-1"
        >
          ✕
        </button>
      </div>

      {tpl.inputs.length > 0 && (
        <div className="pt-1.5">
          {tpl.inputs.map((p) => (
            <PortRow key={p.id} port={p} side="target" />
          ))}
        </div>
      )}

      <div className="px-3 py-2 space-y-2">{children}</div>

      {tpl.outputs.length > 0 && (
        <div className="pb-1.5">
          {tpl.outputs.map((p) => (
            <PortRow key={p.id} port={p} side="source" />
          ))}
        </div>
      )}

      {info.error && (
        <div className="px-3 pb-2 text-[11px] text-red-600 dark:text-red-400">
          {info.error}
        </div>
      )}
    </div>
  );
}

const fieldClass =
  "w-full text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-60 nodrag";

// Not fieldClass — that carries w-full which fights flex-1/fixed widths.
const selectBase =
  "text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-60 nodrag";

/** Quality + aspect + count selects shared by the Image and Video nodes. */
function QualityAspect({
  id,
  data,
  disabled,
}: {
  id: string;
  data: Record<string, unknown>;
  disabled: boolean;
}) {
  const { updateNodeData } = useWorkflowRuntime();
  const quality = String(data.quality ?? "standard");
  const aspect = String(data.aspect_ratio ?? "1:1");
  const count = Number(data.count ?? 1);
  return (
    <div className="flex gap-1.5">
      <select
        value={quality}
        disabled={disabled}
        onChange={(e) => updateNodeData(id, { quality: e.target.value })}
        title="Chất lượng"
        className={`${selectBase} flex-1 min-w-0`}
      >
        {QUALITY_PRESETS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={aspect}
        disabled={disabled}
        onChange={(e) => updateNodeData(id, { aspect_ratio: e.target.value })}
        title="Tỉ lệ khung"
        className={`${selectBase} w-[72px] shrink-0`}
      >
        {ASPECT_PRESETS_SHORT.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={count}
        disabled={disabled}
        onChange={(e) => updateNodeData(id, { count: Number(e.target.value) })}
        title="Số lượng tạo (1-4)"
        className={`${selectBase} w-12 shrink-0`}
      >
        {[1, 2, 3, 4].map((n) => (
          <option key={n} value={n}>
            ×{n}
          </option>
        ))}
      </select>
    </div>
  );
}

// Wired-input notice replacing a hidden own-field.
function WiredBadge({ label }: { label: string }) {
  return (
    <div className="text-[10px] text-amber-600 dark:text-amber-400 rounded-md border border-dashed border-amber-300 dark:border-amber-700/60 px-2 py-1.5">
      {label}
    </div>
  );
}

function ResultImage({ url }: { url: string }) {
  return (
    <a href={`${API_BASE_URL}${url}`} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${API_BASE_URL}${url}`}
        alt="kết quả"
        loading="lazy"
        className="w-full max-h-60 object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
      />
    </a>
  );
}

function ResultVideo({ url }: { url: string }) {
  return (
    <video
      src={`${API_BASE_URL}${url}`}
      controls
      loop
      muted
      playsInline
      className="w-full max-h-60 rounded-md border border-slate-200 dark:border-slate-700 bg-black"
    />
  );
}

/** Render a node result: 1 item full-width, multiple (count>1) as a 2-col grid. */
function ResultMedia({ result }: { result?: NodeResult }) {
  if (!result || result.kind === "text") return null;
  const items =
    result.all && result.all.length
      ? result.all
      : [{ url: result.url, imageId: result.imageId }];
  const isVideo = result.kind === "video";
  if (items.length === 1) {
    return isVideo ? (
      <ResultVideo url={items[0].url} />
    ) : (
      <ResultImage url={items[0].url} />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {items.map((it) =>
        isVideo ? (
          <ResultVideo key={it.imageId} url={it.url} />
        ) : (
          <ResultImage key={it.imageId} url={it.url} />
        ),
      )}
    </div>
  );
}

function TextNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useWorkflowRuntime();
  const value = String((data as Record<string, unknown>).value ?? "");
  return (
    <NodeShell id={id} nodeType="text" selected={selected}>
      <textarea
        value={value}
        onChange={(e) => updateNodeData(id, { value: e.target.value })}
        placeholder="Nhập văn bản / prompt…"
        rows={3}
        className={`${fieldClass} resize-none`}
      />
    </NodeShell>
  );
}

function LLMNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useWorkflowRuntime();
  const info = useNodeRunInfo(id);
  const inWired =
    useNodeConnections({ handleType: "target", handleId: "in" }).length > 0;
  const d = data as Record<string, unknown>;
  const prompt = String(d.prompt ?? "");
  const system = String(d.system ?? "");
  const res = info.result ?? (d.__output as NodeResult | undefined);
  const out = res?.kind === "text" ? res.text : "";
  return (
    <NodeShell id={id} nodeType="llm" selected={selected}>
      {inWired ? (
        <WiredBadge label="Nội dung: dùng từ node nối vào" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="Nhập nội dung / câu hỏi cho LLM…"
          rows={3}
          className={`${fieldClass} resize-none`}
        />
      )}
      <label className="block text-[10px] text-slate-400">Hướng dẫn (tuỳ chọn)</label>
      <textarea
        value={system}
        onChange={(e) => updateNodeData(id, { system: e.target.value })}
        placeholder="vd: Viết lại thành prompt tiếng Anh chi tiết."
        rows={2}
        className={`${fieldClass} resize-none`}
      />
      {out && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 max-h-24 overflow-y-auto whitespace-pre-wrap nowheel">
          {out}
        </p>
      )}
    </NodeShell>
  );
}

function ImageNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useWorkflowRuntime();
  const info = useNodeRunInfo(id);
  // When a prompt is wired in, the engine uses it instead of this field.
  const promptWired =
    useNodeConnections({ handleType: "target", handleId: "prompt" }).length > 0;
  const d = data as Record<string, unknown>;
  const prompt = String(d.prompt ?? "");
  const seed = d.seed;
  return (
    <NodeShell id={id} nodeType="image" selected={selected}>
      {promptWired ? (
        <WiredBadge label="Prompt: dùng từ node nối vào" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="Prompt"
          rows={2}
          className={`${fieldClass} resize-none`}
        />
      )}
      <input
        type="number"
        value={typeof seed === "number" ? seed : ""}
        onChange={(e) =>
          updateNodeData(id, {
            seed: e.target.value === "" ? null : Number(e.target.value),
          })
        }
        placeholder="seed (trống = ngẫu nhiên)"
        className={fieldClass}
      />
      <QualityAspect id={id} data={d} disabled={false} />
      <ResultMedia result={info.result ?? (d.__output as NodeResult | undefined)} />
    </NodeShell>
  );
}

function UploadNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useWorkflowRuntime();
  const d = data as Record<string, unknown>;
  const url = d.url as string | undefined;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const out = await api<ImageOut>("/images/upload", {
        method: "POST",
        body: fd,
      });
      updateNodeData(id, { url: out.url, imageId: out.id });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Tải ảnh thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NodeShell id={id} nodeType="upload" selected={selected}>
      <label className="block text-[11px] text-blue-600 dark:text-blue-400 cursor-pointer nodrag">
        {busy ? "Đang tải…" : url ? "Đổi ảnh khác" : "Chọn ảnh từ máy"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={onPick}
          className="hidden"
        />
      </label>
      {err && <p className="text-[11px] text-red-500">{err}</p>}
      {url && <ResultImage url={url} />}
    </NodeShell>
  );
}

function VideoNode({ id, data, selected }: NodeProps) {
  const { updateNodeData } = useWorkflowRuntime();
  const info = useNodeRunInfo(id);
  const promptWired =
    useNodeConnections({ handleType: "target", handleId: "prompt" }).length > 0;
  const prompt = String((data as Record<string, unknown>).prompt ?? "");
  return (
    <NodeShell id={id} nodeType="video" selected={selected}>
      {promptWired ? (
        <WiredBadge label="Prompt: dùng từ node nối vào" />
      ) : (
        <textarea
          value={prompt}
          onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
          placeholder="Mô tả chuyển động (vd: máy quay đẩy nhẹ, mèo chớp mắt)"
          rows={2}
          className={`${fieldClass} resize-none`}
        />
      )}
      <QualityAspect
        id={id}
        data={data as Record<string, unknown>}
        disabled={false}
      />
      <p className="text-[10px] text-slate-400">Cần nối một ảnh gốc vào cổng “Ảnh gốc”.</p>
      <ResultMedia
        result={
          info.result ??
          ((data as Record<string, unknown>).__output as NodeResult | undefined)
        }
      />
    </NodeShell>
  );
}

function OutputNode({ id, data, selected }: NodeProps) {
  const info = useNodeRunInfo(id);
  const wiredIn =
    useNodeConnections({ handleType: "target", handleId: "in" }).length > 0;
  const r =
    info.result ??
    ((data as Record<string, unknown>).__output as NodeResult | undefined);
  return (
    <NodeShell id={id} nodeType="output" selected={selected}>
      {!r && info.status === "done" && wiredIn && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Node phía trước không có kết quả.
        </p>
      )}
      {!r && !(info.status === "done" && wiredIn) && (
        <p className="text-[11px] text-slate-400">Nối node vào rồi nhấn Chạy.</p>
      )}
      {(r?.kind === "image" || r?.kind === "video") && <ResultMedia result={r} />}
      {r?.kind === "text" && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300 max-h-32 overflow-y-auto whitespace-pre-wrap nowheel">
          {r.text}
        </p>
      )}
    </NodeShell>
  );
}

// Defined at module scope so React Flow doesn't re-mount nodes every render.
export const nodeTypes: NodeTypes = {
  text: TextNode,
  llm: LLMNode,
  image: ImageNode,
  upload: UploadNode,
  video: VideoNode,
  output: OutputNode,
};
