"use client";

import { useEffect, useRef, useState } from "react";
import { QUALITY_PRESETS, ASPECT_PRESETS } from "@/lib/mediaPresets";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

// "" = auto (let the LLM infer); presets follow.
const QUALITY_OPTS = [
  { value: "", label: "Chất lượng: tự động" },
  ...QUALITY_PRESETS.map((p) => ({ value: p.value, label: `Chất lượng: ${p.label}` })),
];
const ASPECT_OPTS = [
  { value: "", label: "Tỉ lệ: tự động" },
  ...ASPECT_PRESETS.map((p) => ({ value: p.value, label: `Tỉ lệ ${p.label}` })),
];

export type SendOpts = { quality: string; aspectRatio: string };

export default function MessageInput({
  onSend,
  disabled,
  onStop,
}: {
  onSend: (
    content: string,
    attachedFile: File | null,
    opts: SendOpts,
  ) => void;
  disabled: boolean;
  // When set and `disabled` (a send is in flight), the Send button becomes Stop.
  onStop?: () => void;
}) {
  const [value, setValue] = useState("");
  const [attached, setAttached] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [quality, setQuality] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Manage object-URL lifecycle for the preview thumbnail.
  useEffect(() => {
    if (!attached) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attached);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attached]);

  function send() {
    const trimmed = value.trim();
    if ((!trimmed && !attached) || disabled) return;
    onSend(trimmed, attached, { quality, aspectRatio });
    setValue("");
    setAttached(null);
    setAttachError(null);
    if (textRef.current) textRef.current.style.height = "auto";
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      setAttachError("Chỉ hỗ trợ PNG, JPEG, WebP");
      e.target.value = "";
      return;
    }
    if (f.size > MAX_BYTES) {
      setAttachError(`File quá lớn (${(f.size / 1e6).toFixed(1)}MB, tối đa 10MB)`);
      e.target.value = "";
      return;
    }
    setAttachError(null);
    setAttached(f);
  }

  function clearAttached() {
    setAttached(null);
    setAttachError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-200 dark:border-slate-800 p-4"
    >
      <div className="max-w-3xl mx-auto">
        {previewUrl && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Attached"
                className="h-20 w-20 object-cover rounded-lg border border-slate-300 dark:border-slate-700"
              />
              <button
                type="button"
                onClick={clearAttached}
                title="Bỏ ảnh đính kèm"
                className="absolute -top-1.5 -right-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center leading-none hover:bg-red-600"
              >
                ×
              </button>
            </div>
            <span className="text-xs text-slate-500 truncate max-w-xs">
              {attached?.name} ({((attached?.size || 0) / 1024).toFixed(0)}KB)
            </span>
          </div>
        )}
        {attachError && (
          <div className="mb-2 text-xs text-red-700 dark:text-red-400">
            {attachError}
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            disabled={disabled}
            title="Chất lượng ảnh/video (tự động = để AI quyết định)"
            className="text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-blue-600 disabled:opacity-50"
          >
            {QUALITY_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            disabled={disabled}
            title="Tỉ lệ khung hình"
            className="text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-blue-600 disabled:opacity-50"
          >
            {ASPECT_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 items-end">
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            title="Đính kèm ảnh để sửa"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-50 transition-colors text-lg"
          >
            📎
          </button>

          <textarea
            ref={textRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={
              disabled
                ? "Đang xử lý…"
                : attached
                  ? "Mô tả cách sửa ảnh, ví dụ: đổi nền thành biển hoàng hôn"
                  : "Nhập tin nhắn (Enter để gửi, Shift+Enter xuống dòng)"
            }
            disabled={disabled}
            className="flex-1 resize-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-600 disabled:opacity-50"
          />
          {disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              title="Dừng phản hồi"
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <span className="inline-block h-3 w-3 rounded-[2px] bg-white" />
              Dừng
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || (!value.trim() && !attached)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Gửi
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
