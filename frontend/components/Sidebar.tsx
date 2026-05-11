"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { logout, getMe } from "@/lib/auth";
import type { Conversation, User } from "@/lib/types";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  async function reload() {
    try {
      const list = await api<Conversation[]>("/conversations");
      setConversations(list);
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

  // Reload list on path change so newly created or updated conversations show.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Refetch when chat page signals a change (new title after first message,
  // updated_at bump after each send).
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener("conversations-changed", onChange);
    return () => window.removeEventListener("conversations-changed", onChange);
  }, []);

  async function handleNewChat() {
    setCreating(true);
    try {
      const conv = await api<Conversation>("/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await reload();
      router.push(`/chat/${conv.id}`);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(c: Conversation, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(c.id);
    setEditValue(c.title);
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  async function commitEdit(id: number) {
    const trimmed = editValue.trim();
    const original = conversations.find((c) => c.id === id);
    setEditingId(null);
    if (!trimmed || !original || trimmed === original.title) {
      setEditValue("");
      return;
    }
    setConversations((list) =>
      list.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
    );
    setEditValue("");
    try {
      await api(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmed }),
      });
      window.dispatchEvent(new Event("conversations-changed"));
    } catch {
      reload();
    }
  }

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-3 border-b border-slate-800">
        <button
          onClick={handleNewChat}
          disabled={creating}
          className="w-full py-2 px-3 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          <span>{creating ? "Đang tạo…" : "Cuộc trò chuyện mới"}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">
            Chưa có cuộc trò chuyện
          </p>
        )}
        {conversations.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          const isEditing = editingId === c.id;
          if (isEditing) {
            return (
              <input
                key={c.id}
                ref={editInputRef}
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitEdit(c.id);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={() => commitEdit(c.id)}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-blue-600 rounded-md focus:outline-none text-white"
              />
            );
          }
          return (
            <div
              key={c.id}
              className={`group flex items-center rounded-md transition-colors ${
                active ? "bg-slate-800" : "hover:bg-slate-800/50"
              }`}
              onDoubleClick={(e) => startEdit(c, e)}
            >
              <Link
                href={`/chat/${c.id}`}
                className={`flex-1 min-w-0 px-3 py-2 text-sm truncate ${
                  active ? "text-white" : "text-slate-300"
                }`}
              >
                {c.title}
              </Link>
              <button
                type="button"
                onClick={(e) => startEdit(c, e)}
                title="Đổi tên (hoặc double-click)"
                className="opacity-0 group-hover:opacity-100 text-xs text-slate-400 hover:text-white px-2 py-1 mr-1 rounded transition-opacity"
              >
                Sửa
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 flex items-center justify-between gap-2">
        <div className="text-sm min-w-0 flex-1">
          <div className="font-medium truncate">{user?.username || "…"}</div>
          <div className="text-xs text-slate-500 truncate">{user?.email}</div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 hover:bg-slate-800 rounded shrink-0"
        >
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
