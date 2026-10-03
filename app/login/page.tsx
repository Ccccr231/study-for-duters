import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { BuildingArt } from "@/components/dut/BuildingArt";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "登录" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await currentUser();
  if (user) redirect("/today");

  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/today";

  return (
    <main className="flex flex-1 flex-col bg-white">
      <div className="bg-dut-mist px-6 pt-10 pb-2">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2">
          <BuildingArt className="h-24 w-auto" />
          <h1 className="text-xl font-medium tracking-tight text-dut-deep">Study for DUTERS</h1>
          <p className="text-sm text-muted">计划 → 专注 → 打卡 → 复盘</p>
        </div>
      </div>
      <WaveDivider className="h-12 w-full" />

      <div className="mx-auto w-full max-w-md px-6 pb-16">
        <h2 className="mb-5 text-title font-medium text-ink">登录</h2>
        <AuthForm mode="login" next={target} />
        <p className="mt-6 text-center text-sm text-muted">
          还没有账号？
          {/* 行内 <a> 上 transform 不生效，必须配 inline-block 才有按压反馈 */}
          <Link href="/register" className="tap ml-1 inline-block text-dut">
            注册一个
          </Link>
        </p>
        <p className="mt-8 text-center text-xs text-muted">
          面向 DUT 学生的个人开源项目，非官方。
        </p>
      </div>
    </main>
  );
}
