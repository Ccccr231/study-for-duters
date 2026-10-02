import Link from "next/link";
import { redirect } from "next/navigation";
import { Magnolia } from "@/components/dut/Magnolia";
import { MainBuildingSilhouette } from "@/components/dut/MainBuildingSilhouette";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { currentUser } from "@/lib/auth/session";

const FEATURES = [
  ["计划", "把目标拆成能一天做完的任务"],
  ["专注", "25 分钟番茄钟，每次都落到数据里"],
  ["打卡", "连续天数看得见，别断"],
  ["复盘", "连小理每天给你一份学习报告"],
] as const;

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/today");

  return (
    <main className="flex flex-1 flex-col bg-white">
      {/* hero：移动端居中成塔，桌面端改为左文右图的分栏——
          否则 1280px 宽下会缩成一条居中的窄色带，左右全是空。 */}
      <section className="relative overflow-hidden bg-dut px-6 pt-14 pb-12 text-white sm:pt-20 sm:pb-16">
        {/* 主楼剪影作为横向水印压在最底边（固定高度 + w-full，靠 viewBox 保比例），
            白色描边才在蓝底上可见。压到 -bottom-6 是刻意的：只露上半部分，
            读起来像"地平线"而不是一张和副标题抢注意力的插图。 */}
        <MainBuildingSilhouette
          tone="onBlue"
          className="pointer-events-none absolute inset-x-0 -bottom-6 hidden h-28 w-full opacity-20 sm:block"
        />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center sm:items-start sm:gap-4 sm:text-left">
          <MainBuildingSilhouette tone="onBlue" className="h-20 w-auto opacity-80 sm:hidden" />
          {/* 大字号要负字距（字越大越显松）；这是拉丁字母标题，收一点就够。
              中文副标题用 text-balance，避免在「复 / 盘」这种字中间断行。 */}
          <h1 className="text-[28px] leading-tight font-medium tracking-[-0.01em] sm:text-4xl">
            Study for DUTERS
          </h1>
          <p className="max-w-md text-sm text-balance text-white/85 sm:text-[15px]">
            面向大连理工学生的学习台：计划 → 专注 → 打卡 → 复盘
          </p>
        </div>
      </section>
      <WaveDivider className="h-12 w-full sm:h-14" />

      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 px-6 pt-8 pb-10 sm:pt-10">
        {/* 四张卡在窄屏竖排、宽屏 2×2：桌面端把纵向长度压掉一半，
            视觉上也从"一条清单"变成"一块版面"。 */}
        <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {FEATURES.map(([title, desc], i) => (
            <li
              key={title}
              // 交错入场：一张张浮起，比四张同时出现更有节奏。
              // 延迟只作用在动画上，不阻塞交互（stagger 是装饰性的）。
              className="rise flex items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-line"
              style={{ animationDelay: `${40 + i * 60}ms` }}
            >
              <Magnolia className="h-8 w-8 shrink-0" />
              <div>
                <p className="text-[15px] font-medium text-ink">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="press flex h-12 flex-1 items-center justify-center rounded-xl bg-dut text-[15px] font-medium text-white"
          >
            开始使用
          </Link>
          <Link
            href="/login"
            className="press flex h-12 flex-1 items-center justify-center rounded-xl bg-white text-[15px] text-dut ring-1 ring-line"
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
