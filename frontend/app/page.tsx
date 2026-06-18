"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    router.replace(token ? "/chat" : "/auth");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-slate-500 dark:text-slate-500 text-sm">
      Đang tải…
    </div>
  );
}
