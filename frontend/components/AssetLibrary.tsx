"use client";

import { useCallback, useEffect, useState } from "react";
import { api, API_BASE_URL } from "@/lib/api";
import type { ImageOut } from "@/lib/types";
import AssetGalleryModal from "./AssetGalleryModal";

const UPLOAD_MARKER = "[uploaded by user]";

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(url);
}

export default function AssetLibrary() {
  const [assets, setAssets] = useState<ImageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  // Restore collapsed state once on mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("asset-library-collapsed") === "1");
    } catch {
      // ignore
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await api<ImageOut[]>("/images?limit=200");
      setAssets(list);
    } catch {
      // 401 handled by api(); other errors leave the previous list intact
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // A new image/video is created during a chat send, which dispatches this.
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener("conversations-changed", onChange);
    return () => window.removeEventListener("conversations-changed", onChange);
  }, [reload]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("asset-library-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Mở thư viện"
        className="shrink-0 w-10 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-2"
      >
        <span className="text-lg">🖼</span>
        <span className="text-xs [writing-mode:vertical-rl]">Thư viện</span>
      </button>
    );
  }

  return (
    <aside className="w-64 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Thư viện ({assets.length})
        </h3>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Thu gọn"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm px-1"
        >
          ⟩
        </button>
      </div>

      {assets.length > 0 && (
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={() => setGalleryOpen(true)}
            className="w-full py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Xem tất cả &amp; tải xuống
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <p className="text-xs text-slate-500 text-center py-6">Đang tải…</p>
        ) : assets.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6 px-2">
            Chưa có ảnh nào. Tạo ảnh trong chat để thấy ở đây.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((a) => {
              const fullUrl = `${API_BASE_URL}${a.url}`;
              const uploaded = a.prompt === UPLOAD_MARKER;
              return (
                <a
                  key={a.id}
                  href={fullUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={uploaded ? "Ảnh tải lên" : a.prompt}
                  className="group relative block aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-colors bg-slate-200 dark:bg-slate-800"
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
                      <span className="absolute inset-0 flex items-center justify-center text-white/90 text-2xl pointer-events-none drop-shadow">
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
                  {uploaded && (
                    <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">
                      tải lên
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {galleryOpen && (
        <AssetGalleryModal onClose={() => setGalleryOpen(false)} />
      )}
    </aside>
  );
}
