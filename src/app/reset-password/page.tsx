"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "../actions/auth";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const presetToken = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [token, setToken] = useState(presetToken);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await resetPassword(token, newPassword);
      setSuccess("密码已重置，请使用新密码登录。");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md border border-gray-200 bg-white p-8">
        <h1 className="font-display text-2xl font-bold text-black">重置密码</h1>
        <p className="mt-2 text-sm text-gray-500">请输入重置令牌与新密码。</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="reset-token" className="text-xs font-semibold text-gray-500">
              重置令牌
            </label>
            <input
              id="reset-token"
              name="token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="粘贴忘记密码页面生成的令牌"
              required
            />
          </div>
          <div>
            <label htmlFor="reset-password" className="text-xs font-semibold text-gray-500">
              新密码
            </label>
            <input
              id="reset-password"
              name="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="至少 8 位"
              required
            />
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full border border-black bg-black py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {isSubmitting ? "重置中..." : "确认重置"}
          </button>
        </form>
        <div className="mt-6 text-xs text-gray-500">
          <a href="/login" className="text-black underline">
            返回登录
          </a>
        </div>
      </div>
    </div>
  );
}
