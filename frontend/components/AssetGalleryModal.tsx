"use client";

import { useCallback, useEffect, useState } from "react";
import { api, API_BASE_URL } from "@/lib/api";
import type { ImageOut } from "@/lib/types";

const UPLOAD_MARKER = "[uploaded by user]";

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(url);
}

function filenameOf(a: ImageOut): string {
  const base = a.url.split("/").pop() || `asset-${a.id}`;
  return base;
}

export default function AssetGalleryModal({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<ImageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    api<ImageOut[]>("/images?limit=500")
      .then((list) => active && setAssets(list))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = assets.length > 0 && selected.size === assets.length;

  function selectAll() {
    setSelected(allSelected ? new Set() : new Set(assets.map((a) => a.id)));
  }

  async function downloadSelected() {
    const chosen = assets.filter((a) => selected.has(a.id));
    if (chosen.length === 0 || downloading) return;
    setDownloading(true);
    setProgress({ done: 0, total: chosen.length });
    for (let i = 0; i < chosen.length; i++) {
      const a = chosen[i];
      try {
        const res = await fetch(`${API_BASE_URL}${a.url}`);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objUrl;
        link.download = filenameOf(a);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objUrl);
      } catch {
        // skip a failed item, keep going
      }
      setProgress({ done: i + 1, total: chosen.length });
      // Small gap so the browser doesn't collapse the downloads into one prompt.
      await new Promise((r) => setTimeout(r, 200));
    }
    setDownloading(false);
    setProgress(null);
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/60 backdrop-blur-sm">
      {/* Backdrop click closes */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative m-auto w-[min(96vw,1200px)] h-[min(92vh,900px)] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Tất cả tài sản ({assets.length})
          </h2>
          {selected.size > 0 && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
              Đã chọn {selected.size}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={assets.length === 0}
              className="text-xs px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
            <button
              type="button"
              onClick={downloadSelected}
              disabled={selected.size === 0 || downloading}
              className="text-xs px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:bg-slate-400 transition-colors"
            >
              {downloading && progress
                ? `Đang tải ${progress.done}/${progress.total}…`
                : `Tải xuống (${selected.size})`}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Đóng"
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-2"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-10">Đang tải…</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">
              Chưa có tài sản nào.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {assets.map((a) => {
                const fullUrl = `${API_BASE_URL}${a.url}`;
                const uploaded = a.prompt === UPLOAD_MARKER;
                const isSel = selected.has(a.id);
                return (
                  <div
                    key={a.id}
                    onClick={() => toggle(a.id)}
                    title={uploaded ? "Ảnh tải lên" : a.prompt}
                    className={`group relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer bg-slate-200 dark:bg-slate-800 transition-colors ${
                      isSel
                        ? "border-blue-500 ring-2 ring-blue-500/40"
                        : "border-transparent hover:border-slate-400 dark:hover:border-slate-600"
                    }`}
                  >
                    {isVideo(a.url) ? (
                      <>
                        <video
                          src={fullUrl}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-white/90 text-3xl pointer-events-none drop-shadow">
                          ▶
                        </span>
                      </>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={fullUrl}
                        alt={a.prompt}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Selection checkbox */}
                    <span
                      className={`absolute top-1.5 left-1.5 h-5 w-5 rounded-md flex items-center justify-center text-xs border ${
                        isSel
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-black/40 border-white/70 text-transparent"
                      }`}
                    >
                      ✓
                    </span>

                    {uploaded && (
                      <span className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1 rounded">
                        tải lên
                      </span>
                    )}

                    {/* Open full asset (doesn't toggle selection) */}
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Mở ảnh/video gốc"
                      className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded transition-opacity"
                    >
                      ↗
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
