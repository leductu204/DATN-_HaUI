import type { Metadata } from "next";
import "./globals.css";
import JobsBar from "@/components/JobsBar";

export const metadata: Metadata = {
  title: "MIT Chat",
  description: "DATN HaUI — LLM chat with image generation",
};

// Runs synchronously in <head> before React hydrates, so the correct theme
// class is on <html> before first paint. Avoids FOUC and hydration mismatch.
const THEME_INIT = `(function(){try{var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(!s&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body
        className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-full"
        suppressHydrationWarning
      >
        {children}
        <JobsBar />
      </body>
    </html>
  );
}
