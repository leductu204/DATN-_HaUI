"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/chat", label: "Chat", match: "/chat" },
  { href: "/workflow", label: "Workflow", match: "/workflow" },
];

export default function AppNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/70">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.match);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 text-center text-xs font-medium py-1.5 rounded-md transition-colors ${
              active
                ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
