"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Conversation, Message } from "@/lib/types";
import MessageList from "@/components/MessageList";
import MessageInput from "@/components/MessageInput";
import ProviderToggle from "@/components/ProviderToggle";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const conversationId = parseInt(id, 10);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("ollama");

  useEffect(() => {
    let active = true;
    setMessages([]);
    setConversation(null);
    setError(null);

    Promise.all([
      api<Message[]>(`/conversations/${conversationId}/messages`),
      api<Conversation[]>(`/conversations`).then(
        (arr) => arr.find((c) => c.id === conversationId) || null,
      ),
    ])
      .then(([msgs, conv]) => {
        if (active) {
          setMessages(msgs);
          setConversation(conv);
        }
      })
      .catch((err) => {
        if (active)
          setError(err instanceof Error ? err.message : "Không tải được cuộc trò chuyện");
      });

    return () => {
      active = false;
    };
  }, [conversationId]);

  // Refetch the header title when the sidebar signals a rename or change.
  useEffect(() => {
    const onChange = async () => {
      try {
        const convos = await api<Conversation[]>(`/conversations`);
        const updated = convos.find((c) => c.id === conversationId);
        if (updated) setConversation(updated);
      } catch {
        // ignore — 401 handled by api()
      }
    };
    window.addEventListener("conversations-changed", onChange);
    return () => window.removeEventListener("conversations-changed", onChange);
  }, [conversationId]);

  async function handleSend(content: string) {
    setSending(true);
    setError(null);

    // Optimistic append: show user message immediately while waiting for reply.
    const optimistic: Message = {
      id: -Date.now(),
      role: "user",
      content,
      tool_calls: null,
      tool_call_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      // BE returns the final assistant message; reload list to capture any
      // intermediate tool messages (image cards).
      await api(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, provider }),
      });
      const [fresh, convos] = await Promise.all([
        api<Message[]>(`/conversations/${conversationId}/messages`),
        api<Conversation[]>(`/conversations`),
      ]);
      setMessages(fresh);
      const updated = convos.find((c) => c.id === conversationId);
      if (updated) setConversation(updated);
      // Tell the sidebar its list is stale (new title, updated_at).
      window.dispatchEvent(new Event("conversations-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gửi tin nhắn thất bại");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-300 truncate">
          {conversation?.title || "Đang tải…"}
        </h2>
        <ProviderToggle value={provider} onChange={setProvider} />
      </header>

      <MessageList messages={messages} loading={sending} />

      {error && (
        <div className="px-4 py-2 text-sm text-red-400 bg-red-950/30 border-t border-red-900">
          {error}
        </div>
      )}

      <MessageInput onSend={handleSend} disabled={sending} />
    </>
  );
}
