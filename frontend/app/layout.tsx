import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatbot",
  description: "DATN HaUI — LLM chat with image generation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full">
      <body
        className="bg-slate-950 text-slate-100 min-h-full"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
