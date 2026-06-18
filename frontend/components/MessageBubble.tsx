"use client";

import { API_BASE_URL } from "@/lib/api";
import type { Message } from "@/lib/types";

type ToolResult = {
  status?: string;
  url?: string;
  error?: string;
  image_id?: number;
  media_type?: string;
  duration_seconds?: number;
};

function formatDuration(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|mkv)$/i.test(url);
}

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
      const isVideo =
        result.media_type === "video" || isVideoUrl(result.url);
      return (
        <div className="flex justify-start">
          <div className="max-w-md">
            {isVideo ? (
              <video
                src={fullUrl}
                controls
                loop
                muted
                playsInline
                className="w-full h-auto block rounded-2xl border border-slate-300 dark:border-slate-700"
              />
            ) : (
              <a
                href={fullUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-700 hover:border-slate-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fullUrl}
                  alt="Generated"
                  className="w-full h-auto block"
                />
              </a>
            )}
            {typeof result.duration_seconds === "number" && (
              <div className="text-xs text-slate-500 mt-1.5 px-1">
                Đã hoàn thành trong {formatDuration(result.duration_seconds)}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-start">
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm px-4 py-2 rounded-2xl max-w-md">
          {result.error || "Lỗi tạo ảnh"}
        </div>
      </div>
    );
  }

  if (message.role === "user") {
    // Attached-image marker: "[Đã đính kèm: <url>]\n<text>". The URL is the
    // uploaded source image; render it as a small thumbnail. Older messages
    // stored a filename instead of a URL — those stay plain text.
    const m = message.content.match(/^\[Đã đính kèm: (.+?)\]\n?/);
    let thumbUrl: string | null = null;
    let text = message.content;
    if (m && (m[1].startsWith("/") || m[1].startsWith("http"))) {
      thumbUrl = m[1].startsWith("http") ? m[1] : `${API_BASE_URL}${m[1]}`;
      text = message.content.slice(m[0].length);
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] flex flex-col items-end gap-1.5">
          {thumbUrl && (
            <a href={thumbUrl} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl}
                alt="Ảnh đính kèm"
                className="max-h-40 rounded-xl border border-blue-300/60 dark:border-blue-800"
              />
            </a>
          )}
          {text.trim() && (
            <div className="rounded-2xl px-4 py-2.5 bg-blue-600 text-white">
              <div className="text-sm whitespace-pre-wrap break-words">{text}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl px-4 py-2.5 bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
}
