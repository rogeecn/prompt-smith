"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md border border-gray-200 bg-white p-8">
        <h1 className="font-display text-2xl font-bold text-black">登录</h1>
        <p className="mt-2 text-sm text-gray-500">使用账号继续管理项目。</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="login-email" className="text-xs font-semibold text-gray-500">
              邮箱
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs font-semibold text-gray-500">
              密码
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="至少 8 位"
              required
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full border border-black bg-black py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </form>
        <div className="mt-6 text-xs text-gray-500">
          还没有账号？{" "}
          <a href="/register" className="text-black underline">
            注册
          </a>
        </div>
      </div>
    </div>
  );
}
