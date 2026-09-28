import Link from "next/link";
import { redirect } from "next/navigation";
import { Magnolia } from "@/components/dut/Magnolia";
import { MainBuildingSilhouette } from "@/components/dut/MainBuildingSilhouette";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { currentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/today");

  return (
    <main className="flex flex-1 flex-col bg-white">
      <div className="bg-dut px-6 pt-12 pb-6 text-white">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
          <MainBuildingSilhouette className="h-24 w-auto opacity-90" />
          <h1 className="text-2xl font-medium">Study for DUTERS</h1>
          <p className="text-sm opacity-90">
            面向大连理工学生的学习台：计划 → 专注 → 打卡 → 复盘
          </p>
        </div>
      </div>
      <WaveDivider className="h-14 w-full" />

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-6 py-8">
        <ul className="flex w-full flex-col gap-3">
          {[
            ["计划", "把目标拆成能一天做完的任务"],
            ["专注", "25 分钟番茄钟，每次都落到数据里"],
            ["打卡", "连续天数看得见，别断"],
            ["复盘", "连小理每天给你一份学习报告"],
          ].map(([title, desc]) => (
            <li
              key={title}
              className="flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-line"
            >
              <Magnolia className="h-8 w-8 shrink-0" />
              <div>
                <p className="text-[15px] font-medium text-ink">{title}</p>
                <p className="text-sm text-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex w-full gap-3">
          <Link
            href="/register"
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-dut text-[15px] font-medium text-white"
          >
            开始使用
          </Link>
          <Link
            href="/login"
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-white text-[15px] text-dut ring-1 ring-line"
          >
            登录
          </Link>
        </div>

        <p className="text-center text-xs text-muted">
          面向 DUT 学生的个人开源项目，非官方；LLM 由使用者自行配置，平台不预置任何密钥。
        </p>
      </div>
    </main>
  );
}
