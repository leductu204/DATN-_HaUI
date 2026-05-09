import { API_BASE_URL, api, setToken, clearToken } from "./api";
import type { AuthResponse, User } from "./types";

export async function login(
  username: string,
  password: string,
): Promise<void> {
  const body = new URLSearchParams({ username, password });
  const resp = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "Đăng nhập thất bại");
  }
  const data: AuthResponse = await resp.json();
  setToken(data.access_token);
}

export async function register(
  email: string,
  username: string,
  password: string,
): Promise<void> {
  const resp = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.detail || "Đăng ký thất bại");
  }
}

export async function getMe(): Promise<User> {
  return api<User>("/auth/me");
}

export function logout(): void {
  clearToken();
  if (typeof window !== "undefined") {
    window.location.href = "/auth";
  }
}
