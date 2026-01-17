"use client";

import { useState } from "react";
import { requestPasswordReset } from "../actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setToken(null);
    setExpiresAt(null);
    try {
      const result = await requestPasswordReset(email);
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md border border-gray-200 bg-white p-8">
        <h1 className="font-display text-2xl font-bold text-black">找回密码</h1>
        <p className="mt-2 text-sm text-gray-500">
          无邮件服务模式：提交后会生成一次性重置令牌，请立即复制。
        </p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="forgot-email" className="text-xs font-semibold text-gray-500">
              邮箱
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="you@example.com"
              required
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full border border-black bg-black py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {isSubmitting ? "生成中..." : "生成重置令牌"}
          </button>
        </form>
        {token ? (
          <div className="mt-6 border border-dashed border-gray-300 p-4 text-xs text-gray-700">
            <div className="font-semibold text-black">重置令牌</div>
            <div className="mt-2 break-all font-mono text-sm">{token}</div>
            {expiresAt && (
              <div className="mt-2 text-gray-500">有效期至：{new Date(expiresAt).toLocaleString()}</div>
            )}
            <a href={`/reset-password?token=${encodeURIComponent(token)}`} className="mt-3 inline-block text-black underline">
              去重置密码
            </a>
          </div>
        ) : (
          <p className="mt-6 text-xs text-gray-500">
            若账号存在会生成令牌；请在有效期内完成重置。
          </p>
        )}
        <div className="mt-6 text-xs text-gray-500">
          记起密码了？{" "}
          <a href="/login" className="text-black underline">
            返回登录
          </a>
        </div>
      </div>
    </div>
  );
}
