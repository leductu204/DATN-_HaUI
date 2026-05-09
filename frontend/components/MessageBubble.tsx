"use client";

import { API_BASE_URL } from "@/lib/api";
import type { Message } from "@/lib/types";

type ToolResult = {
  status?: string;
  url?: string;
  error?: string;
  image_id?: number;
};

export default function MessageBubble({ message }: { message: Message }) {
  if (message.role === "system") return null;

  // Assistant message that ONLY emitted tool_calls (no text content) is a
  // bookkeeping marker — the visual outcome shows up via the following tool
  // result. Skip it.
  if (
    message.role === "assistant" &&
    message.tool_calls &&
    !message.content?.trim()
  ) {
    return null;
  }

  if (message.role === "tool") {
    let result: ToolResult = {};
    try {
      result = JSON.parse(message.content);
    } catch {
      // keep empty
    }

    if (result.status === "ok" && result.url) {
      const fullUrl = `${API_BASE_URL}${result.url}`;
      return (
        <div className="flex justify-start">
          <a
            href={fullUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl overflow-hidden border border-slate-700 max-w-md hover:border-slate-500 transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fullUrl}
              alt="Generated"
              className="w-full h-auto block"
            />
          </a>
        </div>
      );
    }

    return (
      <div className="flex justify-start">
        <div className="bg-red-950/50 border border-red-900 text-red-300 text-sm px-4 py-2 rounded-2xl max-w-md">
          {result.error || "Lỗi tạo ảnh"}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-100"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
}
