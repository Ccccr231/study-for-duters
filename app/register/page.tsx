import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { MainBuildingSilhouette } from "@/components/dut/MainBuildingSilhouette";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "注册" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const user = await currentUser();
  if (user) redirect("/today");

  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/today";

  return (
    <main className="flex flex-1 flex-col bg-white">
      <div className="bg-dut-mist px-6 pt-10 pb-2">
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2">
          <MainBuildingSilhouette className="h-20 w-auto" />
          <h1 className="text-xl font-medium text-dut-deep">加入 Study for DUTERS</h1>
          <p className="text-sm text-muted">先把第一个 25 分钟跑起来</p>
        </div>
      </div>
      <WaveDivider className="h-12 w-full" />

      <div className="mx-auto w-full max-w-md px-6 pb-16">
        <AuthForm mode="register" next={target} />
        <p className="mt-6 text-center text-sm text-muted">
          已经有账号？
          <Link href="/login" className="ml-1 text-dut">
            去登录
          </Link>
        </p>
      </div>
    </main>
  );
}
