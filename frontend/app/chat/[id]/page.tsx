"use client";

import { use, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Conversation, ImageOut, Message } from "@/lib/types";
import MessageList from "@/components/MessageList";
import MessageInput, { type SendOpts } from "@/components/MessageInput";
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
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

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

  async function handleSend(
    content: string,
    attachedFile: File | null,
    opts: SendOpts,
  ) {
    setSending(true);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    stoppedRef.current = false;

    const optimisticId = -Date.now();
    try {
      // 1) Upload the attached image FIRST so (a) it becomes the latest user
      //    image that edit_image picks up, and (b) we get its URL to embed in
      //    the message marker so the source thumbnail renders in the bubble.
      let displayContent = content;
      if (attachedFile) {
        const fd = new FormData();
        fd.append("file", attachedFile);
        const up = await api<ImageOut>(`/images/upload`, {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
        displayContent = `[Đã đính kèm: ${up.url}]\n${content || "(không có mô tả)"}`;
      }

      // Optimistic append: show the user's message (with source thumbnail) while
      // the ~minutes-long generation runs.
      const optimistic: Message = {
        id: optimisticId,
        role: "user",
        content: displayContent,
        tool_calls: null,
        tool_call_id: null,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, optimistic]);

      // 2) Send the chat message — orchestrator routes to edit_image when the
      //    LLM decides this is an edit request. Empty quality/aspect = "auto"
      //    (let the LLM infer); a chosen value overrides the LLM.
      await api(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: displayContent,
          provider,
          quality: opts.quality || null,
          aspect_ratio: opts.aspectRatio || null,
        }),
        signal: controller.signal,
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
      if (stoppedRef.current) {
        // User hit Stop — the backend aborts the orchestrator. Sync to whatever
        // got saved (the user message; usually no assistant reply).
        try {
          const fresh = await api<Message[]>(
            `/conversations/${conversationId}/messages`,
          );
          setMessages(fresh);
          window.dispatchEvent(new Event("conversations-changed"));
        } catch {
          // ignore
        }
      } else {
        setError(err instanceof Error ? err.message : "Gửi tin nhắn thất bại");
        setMessages((m) => m.filter((x) => x.id !== optimisticId));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    stoppedRef.current = true;
    abortRef.current?.abort();
  }

  return (
    <>
      <header className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {conversation?.title || "Đang tải…"}
        </h2>
        <ProviderToggle value={provider} onChange={setProvider} />
      </header>

      <MessageList messages={messages} loading={sending} />

      {error && (
        <div className="px-4 py-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
          {error}
        </div>
      )}

      <MessageInput onSend={handleSend} disabled={sending} onStop={handleStop} />
    </>
  );
}
