"use client";

import { useActionState } from "react";
import { loginAction, registerAction, type AuthState } from "@/lib/actions/auth";

export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const isLogin = mode === "login";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isLogin ? loginAction : registerAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {!isLogin && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">昵称（可留空）</span>
          <input
            name="name"
            autoComplete="nickname"
            className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">邮箱</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-muted">密码</span>
        <input
          name="password"
          type="password"
          required
          minLength={isLogin ? undefined : 8}
          autoComplete={isLogin ? "current-password" : "new-password"}
          placeholder={isLogin ? "" : "至少 8 位"}
          className="h-11 rounded-lg border border-line bg-white px-3 text-body outline-none transition-colors duration-150 focus:border-dut"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="press h-11 rounded-lg bg-dut text-body font-medium text-white transition-opacity duration-150 disabled:opacity-60"
      >
        {pending ? "处理中…" : isLogin ? "登录" : "注册并开始"}
      </button>
    </form>
  );
}
