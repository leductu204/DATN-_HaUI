"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type ColorMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { api } from "@/lib/api";
import type { Workflow, WorkflowGraph } from "@/lib/types";
import {
  NODE_TEMPLATES,
  PALETTE,
  getTemplate,
  getPort,
  kindsCompatible,
} from "@/lib/workflow/registry";
import {
  runGraph,
  WorkflowRunError,
  type GraphEdge,
  type GraphNode,
  type NodeResult,
  type ResultCache,
} from "@/lib/workflow/engine";
import { nodeTypes } from "./nodes";
import {
  WorkflowRuntimeProvider,
  type NodeRunInfo,
} from "./WorkflowContext";

const DND_TYPE = "application/x-datn-node";
const AUTOSAVE_DELAY = 2000;

function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// One palette/menu entry. `draggable` is only meaningful for the left panel.
function NodeButton({
  tpl,
  draggable,
  compact,
  onPick,
  onDragStart,
}: {
  tpl: (typeof NODE_TEMPLATES)[string];
  draggable?: boolean;
  compact?: boolean;
  onPick: (type: string) => void;
  onDragStart?: (e: React.DragEvent, type: string) => void;
}) {
  return (
    <button
      draggable={draggable && !tpl.disabled}
      onDragStart={
        onDragStart && !tpl.disabled
          ? (e) => onDragStart(e, tpl.type)
          : undefined
      }
      onClick={() => onPick(tpl.type)}
      title={tpl.description}
      disabled={tpl.disabled}
      className={`w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg border transition-colors ${
        tpl.disabled
          ? "border-dashed border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
          : "border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-slate-800 hover:border-blue-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 cursor-pointer"
      } ${draggable && !tpl.disabled ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <span className="text-base leading-none shrink-0">{tpl.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium truncate">
          {tpl.label}
          {tpl.disabled && <span className="ml-1 text-[9px]">(sắp có)</span>}
        </span>
        {!compact && (
          <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate">
            {tpl.description}
          </span>
        )}
      </span>
    </button>
  );
}

function Canvas({ workflow }: { workflow: Workflow }) {
  const graph = workflow.graph || { nodes: [], edges: [] };
  const [nodes, setNodes, onNodesChange] = useNodesState(
    (graph.nodes as Node[]) ?? [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (graph.edges as Edge[]) ?? [],
  );
  const [name, setName] = useState(workflow.name);
  const [runState, setRunState] = useState<Record<string, NodeRunInfo>>({});
  const [activeIds, setActiveIds] = useState<string[]>([]);
  // Count of in-flight runs (not a lock). The backend serialises GPU work
  // FIFO via its own lock, so the FE never blocks new submits.
  const [runningCount, setRunningCount] = useState(0);
  const running = runningCount > 0;
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Right-click "add node" menu: screen x/y to position it + flow x/y to drop.
  const [menu, setMenu] = useState<
    { x: number; y: number; flow: { x: number; y: number } } | null
  >(null);
  const [paletteOpen, setPaletteOpen] = useState(true);

  const { screenToFlowPosition, toObject, fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dark = useIsDark();

  // Restore palette open/closed once on mount (persisted across sessions).
  useEffect(() => {
    try {
      setPaletteOpen(localStorage.getItem("workflow-palette-open") !== "0");
    } catch {
      // ignore
    }
  }, []);

  function togglePalette() {
    setPaletteOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem("workflow-palette-open", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  // Reused across Run clicks so unchanged nodes skip the GPU.
  const cacheRef = useRef<ResultCache>(new Map());
  // Latest nodes/edges for keyboard handlers (avoid re-binding the listener).
  const nodesRef = useRef<Node[]>(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef<Edge[]>(edges);
  edgesRef.current = edges;
  // Latest run results for per-node re-runs (reuse ancestors that already ran).
  const runStateRef = useRef<Record<string, NodeRunInfo>>(runState);
  runStateRef.current = runState;
  const clipboardRef = useRef<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  // Unsaved-changes tracking + debounced autosave.
  const dirtyRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef<() => void>(() => {});

  const onSave = useCallback(async () => {
    setSaving(true);
    setNotice(null);
    try {
      const obj = toObject();
      const payload: { name: string; graph: WorkflowGraph } = {
        name: name.trim() || "Untitled workflow",
        graph: { nodes: obj.nodes, edges: obj.edges, viewport: obj.viewport },
      };
      await api(`/workflows/${workflow.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      dirtyRef.current = false;
      setSavedAt(new Date().toLocaleTimeString());
      window.dispatchEvent(new Event("workflows-changed"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Lưu thất bại.");
    } finally {
      setSaving(false);
    }
  }, [name, toObject, workflow.id]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => onSaveRef.current(), AUTOSAVE_DELAY);
  }, []);

  // Warn on tab close / reload if there are unsaved edits the autosave debounce
  // hasn't flushed yet.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      // Ignore pure measurement/selection churn (fires on mount) — only real
      // edits mark the board dirty.
      if (changes.some((c) => c.type === "position" || c.type === "remove")) {
        markDirty();
      }
    },
    [onNodesChange, markDirty],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type === "remove")) markDirty();
    },
    [onEdgesChange, markDirty],
  );

  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
      markDirty();
    },
    [setNodes, markDirty],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      markDirty();
    },
    [setNodes, setEdges, markDirty],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const srcNode = nodes.find((n) => n.id === conn.source);
      const tgtNode = nodes.find((n) => n.id === conn.target);
      if (!srcNode || !tgtNode) return;
      const srcPort = getPort(srcNode.type ?? "", "outputs", conn.sourceHandle);
      const tgtPort = getPort(tgtNode.type ?? "", "inputs", conn.targetHandle);
      if (!srcPort || !tgtPort || !kindsCompatible(srcPort.kind, tgtPort.kind)) {
        setNotice("Không thể nối: kiểu cổng không khớp.");
        return;
      }
      setEdges((eds) => {
        // One edge per target handle — replace any existing.
        const cleaned = eds.filter(
          (e) =>
            !(e.target === conn.target && e.targetHandle === conn.targetHandle),
        );
        return addEdge({ ...conn, animated: true }, cleaned);
      });
      markDirty();
    },
    [nodes, setEdges, markDirty],
  );

  const addNode = useCallback(
    (type: string, position: { x: number; y: number }) => {
      const tpl = getTemplate(type);
      if (!tpl) return;
      if (tpl.disabled) {
        setNotice(`Node "${tpl.label}" chưa hỗ trợ — sẽ bổ sung sau.`);
        return;
      }
      const node: Node = {
        id: `${type}-${crypto.randomUUID().slice(0, 8)}`,
        type,
        position,
        data: { ...tpl.defaultData },
      };
      setNodes((nds) => [...nds, node]);
      markDirty();
    },
    [setNodes, markDirty],
  );

  // Copy currently-selected nodes (+ edges between them) to the clipboard.
  const copySelection = useCallback((): boolean => {
    const sel = nodesRef.current.filter((n) => n.selected);
    if (sel.length === 0) return false;
    const selIds = new Set(sel.map((n) => n.id));
    clipboardRef.current = {
      nodes: sel.map((n) => ({ ...n, data: structuredClone(n.data) })),
      edges: edgesRef.current.filter(
        (e) => selIds.has(e.source) && selIds.has(e.target),
      ),
    };
    return true;
  }, []);

  // Paste the clipboard: fresh ids, offset position, remap internal edges. The
  // pasted nodes become the new selection; everything else is deselected.
  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (clip.nodes.length === 0) return;
    const idMap = new Map<string, string>();
    const newNodes: Node[] = clip.nodes.map((n) => {
      const nid = `${n.type}-${crypto.randomUUID().slice(0, 8)}`;
      idMap.set(n.id, nid);
      return {
        ...n,
        id: nid,
        position: { x: n.position.x + 40, y: n.position.y + 40 },
        selected: true,
        data: structuredClone(n.data),
      };
    });
    const newEdges: Edge[] = clip.edges.map((e) => ({
      ...e,
      id: `e-${crypto.randomUUID().slice(0, 8)}`,
      source: idMap.get(e.source) as string,
      target: idMap.get(e.target) as string,
      selected: false,
    }));
    setNodes((nds) => [
      ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...newNodes,
    ]);
    setEdges((eds) => [...eds, ...newEdges]);
    markDirty();
  }, [setNodes, setEdges, markDirty]);

  // Ctrl/Cmd + C / V / D. Skipped while typing in a field so text copy/paste
  // still works inside node inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        copySelection();
      } else if (k === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if (k === "d") {
        e.preventDefault();
        if (copySelection()) pasteClipboard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelection, pasteClipboard]);

  // Right-click on empty canvas → open the add-node menu at the cursor.
  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault();
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setMenu({ x: e.clientX, y: e.clientY, flow });
    },
    [screenToFlowPosition],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  // Close the menu on Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const onDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData(DND_TYPE, type);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_TYPE);
      if (!type) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, position);
    },
    [screenToFlowPosition, addNode],
  );

  const onClickAdd = useCallback(
    (type: string) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 3,
          })
        : { x: 100, y: 100 };
      addNode(type, {
        x: center.x + (Math.floor(Math.random() * 6) - 3) * 20,
        y: center.y + (Math.floor(Math.random() * 6) - 3) * 20,
      });
    },
    [screenToFlowPosition, addNode],
  );

  const executeSubset = useCallback(
    async (
      liveNodes: GraphNode[],
      liveEdges: GraphEdge[],
      reuse?: { forceId: string; results: Map<string, NodeResult> },
    ) => {
      if (liveNodes.length === 0) {
        setNotice("Chưa có node nào để chạy.");
        return;
      }
      setNotice(null);
      setRunningCount((c) => c + 1);
      const ids = liveNodes.map((n) => n.id);
      setActiveIds(ids);
      setRunState((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = { status: "idle" };
        return next;
      });
      try {
        await runGraph(
          liveNodes,
          liveEdges,
          (id, status, extra) => {
            setRunState((prev) => ({
              ...prev,
              [id]: {
                status,
                result: extra?.result,
                error: extra?.error,
                cached: extra?.cached,
              },
            }));
            // Persist the output into node.data so it survives reload.
            if (status === "done" && extra?.result) {
              const out = extra.result;
              setNodes((prev) =>
                prev.map((n) =>
                  n.id === id
                    ? { ...n, data: { ...n.data, __output: out } }
                    : n,
                ),
              );
              markDirty();
            }
          },
          cacheRef.current,
          reuse,
        );
      } catch (err) {
        if (err instanceof WorkflowRunError) {
          const node = liveNodes.find((n) => n.id === err.nodeId);
          const label = node ? getTemplate(node.type ?? "")?.label : undefined;
          setNotice(
            label
              ? `Dừng tại node "${label}": ${err.message}`
              : `Dừng: ${err.message}`,
          );
        } else {
          setNotice(err instanceof Error ? err.message : "Chạy thất bại.");
        }
      } finally {
        setRunningCount((c) => Math.max(0, c - 1));
      }
    },
    [],
  );

  const onRun = useCallback(() => {
    const obj = toObject();
    executeSubset(obj.nodes as GraphNode[], obj.edges as GraphEdge[]);
  }, [toObject, executeSubset]);

  // Download the current graph as a .json file (re-importable via the sidebar).
  const onExport = useCallback(() => {
    const obj = toObject();
    const clean = name.trim() || "workflow";
    const payload = {
      type: "datn-workflow",
      version: 1,
      name: clean,
      graph: { nodes: obj.nodes, edges: obj.edges, viewport: obj.viewport },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = clean.replace(/[^\w-]+/g, "_").slice(0, 60) || "workflow";
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [name, toObject]);

  // Auto-arrange nodes into a tidy left→right layered (topological) layout.
  const autoLayout = useCallback(() => {
    const obj = toObject();
    const ns = obj.nodes as Node[];
    const es = obj.edges as Edge[];
    if (ns.length === 0) return;

    const indeg = new Map<string, number>();
    const out = new Map<string, string[]>();
    ns.forEach((n) => {
      indeg.set(n.id, 0);
      out.set(n.id, []);
    });
    es.forEach((e) => {
      if (!indeg.has(e.target) || !out.has(e.source)) return;
      out.get(e.source)!.push(e.target);
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    });

    // Longest-path layering (Kahn). Cycles can't happen — onConnect prevents them.
    const layer = new Map<string, number>(ns.map((n) => [n.id, 0]));
    const indegW = new Map(indeg);
    const q = ns.filter((n) => indegW.get(n.id) === 0).map((n) => n.id);
    while (q.length) {
      const id = q.shift()!;
      for (const t of out.get(id)!) {
        layer.set(t, Math.max(layer.get(t)!, layer.get(id)! + 1));
        indegW.set(t, indegW.get(t)! - 1);
        if (indegW.get(t) === 0) q.push(t);
      }
    }

    const W = (n: Node) => n.measured?.width ?? n.width ?? 288;
    const H = (n: Node) => n.measured?.height ?? n.height ?? 220;
    const COL_GAP = 90;
    const ROW_GAP = 36;

    const byLayer = new Map<number, Node[]>();
    ns.forEach((n) => {
      const l = layer.get(n.id) ?? 0;
      if (!byLayer.has(l)) byLayer.set(l, []);
      byLayer.get(l)!.push(n);
    });
    const layers = [...byLayer.keys()].sort((a, b) => a - b);

    const colX = new Map<number, number>();
    let x = 0;
    for (const l of layers) {
      colX.set(l, x);
      x += Math.max(...byLayer.get(l)!.map(W)) + COL_GAP;
    }
    const colH = new Map<number, number>();
    for (const l of layers) {
      colH.set(
        l,
        byLayer.get(l)!.reduce((s, n) => s + H(n) + ROW_GAP, -ROW_GAP),
      );
    }
    const maxH = Math.max(...layers.map((l) => colH.get(l)!));

    const pos = new Map<string, { x: number; y: number }>();
    for (const l of layers) {
      const col = byLayer
        .get(l)!
        .slice()
        .sort((a, b) => a.position.y - b.position.y);
      let y = (maxH - colH.get(l)!) / 2; // center each column vertically
      for (const n of col) {
        pos.set(n.id, { x: colX.get(l)!, y });
        y += H(n) + ROW_GAP;
      }
    }

    setNodes((prev) =>
      prev.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)),
    );
    markDirty();
    window.setTimeout(() => fitView({ duration: 400 }), 60);
  }, [toObject, setNodes, fitView, markDirty]);

  // Run a single node plus only the upstream nodes it depends on (its
  // ancestors), so the user can preview one branch without running everything.
  const runNode = useCallback(
    (nodeId: string) => {
      const obj = toObject();
      const allNodes = obj.nodes as GraphNode[];
      const allEdges = obj.edges as GraphEdge[];
      const sources = new Map<string, string[]>();
      for (const e of allEdges) {
        const arr = sources.get(e.target);
        if (arr) arr.push(e.source);
        else sources.set(e.target, [e.source]);
      }
      const keep = new Set<string>([nodeId]);
      const stack = [nodeId];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const src of sources.get(cur) ?? []) {
          if (!keep.has(src)) {
            keep.add(src);
            stack.push(src);
          }
        }
      }
      // Reuse ancestors that already produced a result in this session — only
      // the clicked node (and any ancestor without a result) actually runs.
      const reuseResults = new Map<string, NodeResult>();
      for (const id of keep) {
        if (id === nodeId) continue;
        const info = runStateRef.current[id];
        if (info?.status === "done" && info.result) {
          reuseResults.set(id, info.result);
        }
      }
      executeSubset(
        allNodes.filter((n) => keep.has(n.id)),
        allEdges.filter((e) => keep.has(e.source) && keep.has(e.target)),
        { forceId: nodeId, results: reuseResults },
      );
    },
    [toObject, executeSubset],
  );

  const runtime = useMemo(
    () => ({ runState, updateNodeData, deleteNode, runNode, running }),
    [runState, updateNodeData, deleteNode, runNode, running],
  );

  const progress = useMemo(() => {
    if (activeIds.length === 0) return null;
    const done = activeIds.filter((id) => {
      const s = runState[id]?.status;
      return s === "done" || s === "skipped" || s === "error";
    }).length;
    return { done, total: activeIds.length };
  }, [runState, activeIds]);

  return (
    <div ref={wrapperRef} className="flex-1 h-full">
      <WorkflowRuntimeProvider value={runtime}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={closeMenu}
          onNodeClick={closeMenu}
          onMoveStart={closeMenu}
          nodeTypes={nodeTypes}
          colorMode={(dark ? "dark" : "light") as ColorMode}
          deleteKeyCode={["Delete", "Backspace"]}
          connectionRadius={28}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true }}
        >
          <Background gap={16} />
          <Controls>
            <ControlButton onClick={autoLayout} title="Sắp xếp node (auto layout)">
              <svg
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="5" height="5" rx="1" />
                <rect x="2" y="12" width="5" height="5" rx="1" />
                <rect x="13" y="7.5" width="5" height="5" rx="1" />
                <path d="M7 5.5 H10 V10 H13" />
                <path d="M7 14.5 H10 V10" />
              </svg>
            </ControlButton>
          </Controls>
          <MiniMap
            pannable
            zoomable
            className="!hidden sm:!block"
            nodeColor={(n) =>
              getTemplate(n.type ?? "")?.group === "ai" ? "#8b5cf6" : "#64748b"
            }
          />

          <Panel position="top-left">
            {!paletteOpen ? (
              <button
                type="button"
                onClick={togglePalette}
                title="Hiện danh sách node"
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="text-base leading-none">＋</span> Thêm node
              </button>
            ) : (
            <div className="w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg max-h-[78vh] flex flex-col overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Thêm node
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Kéo thả vào canvas, bấm để thêm, hoặc chuột phải.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={togglePalette}
                  title="Thu gọn"
                  className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm leading-none"
                >
                  ‹
                </button>
              </div>
              <div className="p-2 space-y-3 overflow-y-auto">
                {PALETTE.map((section) => (
                  <div key={section.group} className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-1">
                      {section.title}
                    </p>
                    {Object.values(NODE_TEMPLATES)
                      .filter((t) => t.group === section.group)
                      .map((t) => (
                        <NodeButton
                          key={t.type}
                          tpl={t}
                          draggable
                          onPick={onClickAdd}
                          onDragStart={onDragStart}
                        />
                      ))}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 px-3 py-2 border-t border-slate-100 dark:border-slate-800 leading-relaxed">
                Delete để xoá · Ctrl+C/V sao chép · Ctrl+D nhân đôi
              </p>
            </div>
            )}
          </Panel>

          <Panel position="top-right">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-2 py-1.5">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  markDirty();
                }}
                className="text-xs w-40 bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none text-slate-700 dark:text-slate-200"
              />
              <button
                onClick={onRun}
                title="Chạy cả workflow (có thể bấm nhiều lần — job xếp hàng)"
                className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                ▶ Chạy
              </button>
              <button
                onClick={onExport}
                title="Tải workflow ra file .json"
                className="text-xs px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                ⬇ Export
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white transition-colors"
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
            {(running || notice || savedAt) && (
              <p
                className={`mt-1 text-[11px] text-right ${
                  notice ? "text-red-500" : "text-slate-400"
                }`}
              >
                {running && progress
                  ? `Đang chạy ${progress.done}/${progress.total}${runningCount > 1 ? ` · ${runningCount} lượt` : ""}`
                  : notice || `Đã lưu lúc ${savedAt}`}
              </p>
            )}
          </Panel>
        </ReactFlow>

        {menu && (
          <>
            {/* Backdrop catches the next click to dismiss. */}
            <div className="fixed inset-0 z-40" onClick={closeMenu} />
            <div
              className="fixed z-50 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-xl p-1.5 max-h-[70vh] overflow-y-auto"
              style={{
                left: Math.min(menu.x, window.innerWidth - 220),
                top: Math.min(menu.y, window.innerHeight - 360),
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-2 py-1">
                Thêm node tại đây
              </p>
              {PALETTE.map((section) => (
                <div key={section.group} className="space-y-0.5">
                  <p className="text-[9px] uppercase tracking-wide text-slate-400 px-2 pt-1">
                    {section.title}
                  </p>
                  {Object.values(NODE_TEMPLATES)
                    .filter((t) => t.group === section.group)
                    .map((t) => (
                      <NodeButton
                        key={t.type}
                        tpl={t}
                        compact
                        onPick={(type) => {
                          addNode(type, menu.flow);
                          closeMenu();
                        }}
                      />
                    ))}
                </div>
              ))}
            </div>
          </>
        )}
      </WorkflowRuntimeProvider>
    </div>
  );
}

export default function WorkflowCanvas({ workflow }: { workflow: Workflow }) {
  return (
    <ReactFlowProvider key={workflow.id}>
      <Canvas workflow={workflow} />
    </ReactFlowProvider>
  );
}
