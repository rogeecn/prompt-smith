"use client";

import { useState } from "react";
import { changePassword } from "../src/app/actions/auth";

type AccountClientProps = {
  email: string;
};

export default function AccountClient({ email }: AccountClientProps) {
  const [currentPassword, setCurrentPassword] = useState("");
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
      await changePassword(currentPassword, newPassword);
      setSuccess("密码已更新。");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-md border border-gray-200 bg-white p-8">
        <h1 className="font-display text-2xl font-bold text-black">账号设置</h1>
        <p className="mt-2 text-sm text-gray-500">当前账号：{email}</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="current-password" className="text-xs font-semibold text-gray-500">
              当前密码
            </label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
              placeholder="请输入当前密码"
              required
            />
          </div>
          <div>
            <label htmlFor="new-password" className="text-xs font-semibold text-gray-500">
              新密码
            </label>
            <input
              id="new-password"
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
            {isSubmitting ? "更新中..." : "更新密码"}
          </button>
        </form>
      </div>
    </div>
  );
}
