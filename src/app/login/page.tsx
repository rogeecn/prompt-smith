export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-md text-center">
        <div className="font-display text-2xl text-black">
          本地模式无需登录
        </div>
        <p className="mt-3 text-sm text-gray-500">
          当前分支使用浏览器本地存储，不启用用户系统。
        </p>
        <a href="/" className="mt-4 inline-block text-sm text-black underline">
          返回项目列表
        </a>
      </div>
    </div>
  );
}
