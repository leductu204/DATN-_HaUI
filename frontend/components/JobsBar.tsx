"use client";

import { useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";
import type { Job } from "@/lib/types";

const POLL_MS = 2500;
const COLLAPSE_KEY = "jobsbar-collapsed";
const POS_KEY = "jobsbar-pos";

const KIND_LABEL: Record<Job["kind"], string> = {
  generate: "Tạo ảnh",
  edit: "Sửa ảnh",
  video: "Tạo video",
};

function fmtAge(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(Math.round(s - m * 60)).padStart(2, "0")}`;
}

function Spinner({ big }: { big?: boolean }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full border-2 border-amber-400 border-t-transparent animate-spin ${
        big ? "h-4 w-4" : "h-3.5 w-3.5"
      }`}
    />
  );
}

export default function JobsBar() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  // Free-drag position. null → default (top-right via classes).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number; bx: number; by: number } | null>(
    null,
  );
  const movedRef = useRef(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      const p = localStorage.getItem(POS_KEY);
      if (p) setPos(JSON.parse(p));
    } catch {
      // ignore
    }
  }, []);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }

  function clampPos(x: number, y: number): { x: number; y: number } {
    const el = containerRef.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 80;
    const maxX = window.innerWidth - w - 8;
    const maxY = window.innerHeight - h - 8;
    return {
      x: Math.max(8, Math.min(x, Math.max(8, maxX))),
      y: Math.max(8, Math.min(y, Math.max(8, maxY))),
    };
  }

  function startDrag(e: React.PointerEvent) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, bx: rect.left, by: rect.top };
    movedRef.current = false;
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onDrag(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
    setPos(clampPos(d.bx + dx, d.by + dy));
  }

  function endDrag(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setPos((p) => {
      if (p) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify(p));
        } catch {
          // ignore
        }
      }
      return p;
    });
  }

  // Keep the bar on-screen when the window resizes.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (getToken()) {
        try {
          const list = await api<Job[]>("/jobs");
          if (active) setJobs(list);
        } catch {
          // network/401 — keep last view; api() handles auth redirects
        }
      } else if (active) {
        setJobs([]);
      }
      if (active) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // Drop cancelling-ids that the server already removed.
  useEffect(() => {
    setCancelling((prev) => {
      const live = new Set(jobs.map((j) => j.id));
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  async function cancel(id: string) {
    setCancelling((prev) => new Set(prev).add(id));
    try {
      await api(`/jobs/${id}/cancel`, { method: "POST" });
    } catch {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (jobs.length === 0) return null;

  const running = jobs.some((j) => j.status === "running");
  const posStyle = pos
    ? { left: pos.x, top: pos.y, right: "auto" as const }
    : undefined;
  const posClass = pos ? "" : "top-4 right-4";

  // Collapsed → compact, draggable pill that still shows activity.
  if (collapsed) {
    return (
      <div
        ref={containerRef}
        style={posStyle}
        className={`fixed z-50 ${posClass}`}
      >
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onClick={() => {
            if (movedRef.current) {
              movedRef.current = false;
              return; // was a drag, not a click
            }
            setCollapsedPersist(false);
          }}
          title="Kéo để di chuyển · bấm để mở"
          className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg px-3.5 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          {running ? (
            <Spinner />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
          )}
          <span className="font-medium">Đang xử lý ({jobs.length})</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={posStyle}
      className={`fixed z-50 flex flex-col gap-2 w-96 max-w-[calc(100vw-2rem)] ${posClass}`}
    >
      <div
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        title="Kéo để di chuyển"
        className="flex items-center gap-2 px-1 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="text-slate-400">⠿</span>
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          Đang xử lý ({jobs.length})
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsedPersist(true)}
          title="Thu gọn"
          className="ml-auto text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm leading-none"
        >
          Thu gọn ✕
        </button>
      </div>

      {jobs.map((job) => {
        const isCancelling = cancelling.has(job.id);
        return (
          <div
            key={job.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur shadow-lg px-3.5 py-3"
          >
            {job.status === "running" ? (
              <Spinner big />
            ) : (
              <span className="h-3 w-3 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {KIND_LABEL[job.kind]}
                </span>
                <span className="text-[10px] uppercase tracking-wide rounded bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5">
                  {job.source}
                </span>
                <span className="ml-auto text-slate-400 tabular-nums">
                  {fmtAge(job.age_seconds)}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                {job.status === "queued" ? "Đang chờ GPU… " : ""}
                {job.label || "—"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => cancel(job.id)}
              disabled={isCancelling}
              title="Huỷ job"
              className="shrink-0 text-xs px-2.5 py-1.5 rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
            >
              {isCancelling ? "Đang huỷ…" : "Huỷ"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
