"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/auth";

type Tab = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === "register") {
        await register(email, username, password);
      }
      await login(username, password);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">Chatbot</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">
          Đăng nhập để bắt đầu trò chuyện
        </p>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-8">
          <div className="flex bg-slate-950 rounded-lg p-1 mb-6">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                tab === "login"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`flex-1 py-2 text-sm rounded-md transition-colors ${
                tab === "register"
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Đăng ký
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === "register" && (
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md focus:outline-none focus:border-blue-600 text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                {tab === "login" ? "Username hoặc email" : "Username"}
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md focus:outline-none focus:border-blue-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-md focus:outline-none focus:border-blue-600 text-sm"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-950/50 border border-red-900 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-md text-sm font-medium transition-colors"
            >
              {loading
                ? "Đang xử lý…"
                : tab === "login"
                  ? "Đăng nhập"
                  : "Tạo tài khoản"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
