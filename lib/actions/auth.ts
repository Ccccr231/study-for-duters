"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";

export type AuthState = { error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // 只允许站内相对路径，避免开放重定向
  return value.startsWith("/") && !value.startsWith("//") ? value : "/today";
}

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const next = safeNext(formData.get("next"));

  if (!EMAIL_RE.test(email)) return { error: "邮箱格式不对" };
  if (password.length < 8) return { error: "密码至少 8 位" };

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { error: "这个邮箱已经注册过了" };

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), name: name || null },
    select: { id: true },
  });

  await createSession(user.id);
  redirect(next);
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });

  // 不区分「邮箱不存在」与「密码错误」，避免账号枚举
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "邮箱或密码不对" };
  }

  await createSession(user.id);
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
