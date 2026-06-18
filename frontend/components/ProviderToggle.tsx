"use client";

export default function ProviderToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-600"
    >
      <option value="ollama">Ollama (local)</option>
      <option value="qwen" disabled>
        Qwen (cloud) — Phase 5.5
      </option>
    </select>
  );
}
