export default function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 inline-flex items-center gap-1.5">
        <span
          className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
    </div>
  );
}
