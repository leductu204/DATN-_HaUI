"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { logout, getMe } from "@/lib/auth";
import type { User, Workflow, WorkflowSummary } from "@/lib/types";
import ThemeToggle from "./ThemeToggle";
import AppNav from "./AppNav";

export default function WorkflowSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Restore collapsed state once on mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("workflow-sidebar-collapsed") === "1");
    } catch {
      // ignore
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("workflow-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function reload() {
    try {
      setWorkflows(await api<WorkflowSummary[]>("/workflows"));
    } catch {
      // silent — 401 handled by api()
    }
  }

  useEffect(() => {
    reload();
    getMe()
      .then(setUser)
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener("workflows-changed", onChange);
    return () => window.removeEventListener("workflows-changed", onChange);
  }, []);

  async function handleNew() {
    setCreating(true);
    try {
      const wf = await api<Workflow>("/workflows", {
        method: "POST",
        body: JSON.stringify({ name: "Workflow mới" }),
      });
      await reload();
      router.push(`/workflow/${wf.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      // Accept our export envelope {name, graph} or a bare graph {nodes, edges}.
      const graph = parsed?.graph ?? parsed;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        alert("File không hợp lệ: thiếu nodes/edges.");
        return;
      }
      const name = String(
        parsed?.name || file.name.replace(/\.json$/i, "") || "Workflow nhập",
      ).slice(0, 255);
      const wf = await api<Workflow>("/workflows", {
        method: "POST",
        body: JSON.stringify({
          name,
          graph: {
            nodes: graph.nodes,
            edges: graph.edges,
            viewport: graph.viewport,
          },
        }),
      });
      await reload();
      router.push(`/workflow/${wf.id}`);
    } catch (err) {
      alert(
        "Không nhập được file: " +
          (err instanceof Error ? err.message : "lỗi không xác định"),
      );
    }
  }

  function startEdit(w: WorkflowSummary, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(w.id);
    setEditValue(w.name);
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  async function commitEdit(id: number) {
    const trimmed = editValue.trim();
    const original = workflows.find((w) => w.id === id);
    setEditingId(null);
    if (!trimmed || !original || trimmed === original.name) {
      setEditValue("");
      return;
    }
    setWorkflows((list) =>
      list.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
    );
    setEditValue("");
    try {
      await api(`/workflows/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
    } catch {
      reload();
    }
  }

  async function handleDelete(w: WorkflowSummary, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xoá workflow "${w.name}"?`)) return;
    setWorkflows((list) => list.filter((x) => x.id !== w.id));
    try {
      await api(`/workflows/${w.id}`, { method: "DELETE" });
      if (pathname === `/workflow/${w.id}`) router.push("/workflow");
    } catch {
      reload();
    }
  }

  if (collapsed) {
    return (
      <aside className="w-12 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-3 gap-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Mở danh sách workflow"
          className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 rounded w-8 h-8 flex items-center justify-center"
        >
          ☰
        </button>
        <button
          type="button"
          onClick={handleNew}
          disabled={creating}
          title="Workflow mới"
          className="w-8 h-8 flex items-center justify-center text-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-md transition-colors"
        >
          +
        </button>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <AppNav />
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Thu gọn"
            className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm px-1.5 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            ⟨
          </button>
        </div>
        <button
          onClick={handleNew}
          disabled={creating}
          className="w-full py-2 px-3 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          <span>{creating ? "Đang tạo…" : "Workflow mới"}</span>
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="w-full py-1.5 px-3 text-xs border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <span className="leading-none">⬆</span>
          <span>Nhập workflow (.json)</span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {workflows.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">
            Chưa có workflow nào
          </p>
        )}
        {workflows.map((w) => {
          const active = pathname === `/workflow/${w.id}`;
          if (editingId === w.id) {
            return (
              <input
                key={w.id}
                ref={editInputRef}
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEdit(w.id);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setEditingId(null);
                  }
                }}
                onBlur={() => commitEdit(w.id)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-blue-600 rounded-md focus:outline-none text-slate-900 dark:text-white"
              />
            );
          }
          return (
            <div
              key={w.id}
              className={`group flex items-center rounded-md transition-colors ${
                active
                  ? "bg-slate-200 dark:bg-slate-800"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800/50"
              }`}
              onDoubleClick={(e) => startEdit(w, e)}
            >
              <Link
                href={`/workflow/${w.id}`}
                className={`flex-1 min-w-0 px-3 py-2 text-sm truncate ${
                  active
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-700 dark:text-slate-300"
                }`}
              >
                {w.name}
              </Link>
              <button
                type="button"
                onClick={(e) => startEdit(w, e)}
                title="Đổi tên"
                className="opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-1.5 py-1 rounded transition-opacity"
              >
                Sửa
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(w, e)}
                title="Xoá"
                className="opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 px-1.5 py-1 mr-1 rounded transition-opacity"
              >
                Xoá
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="text-sm min-w-0 flex-1">
          <div className="font-medium truncate">{user?.username || "…"}</div>
          <div className="text-xs text-slate-500 truncate">{user?.email}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <button
            onClick={logout}
            className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    </aside>
  );
}
