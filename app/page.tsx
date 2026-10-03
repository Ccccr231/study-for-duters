import Link from "next/link";
import { redirect } from "next/navigation";
import { Emblem } from "@/components/dut/Emblem";
import { artSrcSet, SIZES } from "@/components/dut/art-sizes";
import { MagnoliaArt } from "@/components/dut/MagnoliaArt";
import { WaveDivider } from "@/components/dut/WaveDivider";
import { FirstVisitIntro } from "@/components/shell/FirstVisitIntro";
import { currentUser } from "@/lib/auth/session";

const FEATURES = [
  ["计划", "把目标拆成能一天做完的任务"],
  ["专注", "25 分钟番茄钟，每次都落到数据里"],
  ["打卡", "连续天数看得见，别断"],
  ["复盘", "连小理每天给你一份学习报告"],
] as const;

/** 一天的节奏。用学生自己的时间感说话，比功能清单更容易被代入。 */
const RHYTHM = [
  ["07:30 早", "定今天", "把今天要做的三件事写进计划，别一睁眼就刷手机。", "bg-amber"],
  ["14:00 午", "沉下去", "一个 25 分钟番茄钟接一个，专注的时长会自己攒起来。", "bg-dut"],
  ["21:00 晚", "打上卡", "连续天数涨一格。断掉的那天，往往是「就差一次」。", "bg-jade"],
  ["23:00 夜", "说两句", "连小理看完你今天的真实数据，给你一份复盘和建议。", "bg-dut-deep"],
] as const;

export default async function Home() {
  const user = await currentUser();
  if (user) redirect("/today");

  return (
    <main className="flex flex-1 flex-col bg-white">
      {/* 开场序列只在落地页播（首次进入 / 每会话一次）。
          放这里而不是 root layout：否则第一次访问 /login 也会先播 2.4 秒校徽。 */}
      <FirstVisitIntro />
      {/* hero：移动端居中成塔，桌面端改为左文右图的分栏——
          否则 1280px 宽下会缩成一条居中的窄色带，左右全是空。 */}
      <section className="relative overflow-hidden bg-dut px-6 pt-14 pb-12 text-white sm:pt-20 sm:pb-16">
        {/* 主楼水彩（所有者提供素材）压在 hero 底部。
            自绘剪影在深蓝上只剩轮廓，换成有笔触的水彩后质感更足；
            压到 -bottom-2 只露楼体主体，并降到 30% 透明度，
            让它读起来像"印在蓝底上的插画"而不是贴上去的图。 */}
        <div className="pointer-events-none absolute inset-x-0 -bottom-2 hidden h-32 justify-center sm:flex">
          {/* eslint-disable-next-line @next/next/no-img-element -- 纯装饰水印，不需要 next/image 的优化与布局开销 */}
          <img
            src="/dut-building.png"
            // 多尺寸变体：这里只显示 128px 高，不必下 512 的图
            srcSet={artSrcSet("/dut-building.png")}
            sizes={SIZES.buildingWatermark}
            alt=""
            aria-hidden="true"
            width={512}
            height={512}
            className="ink-on-blue h-full w-auto object-contain"
          />
        </div>
        <div className="relative mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col items-center gap-3 text-center sm:items-start sm:gap-4 sm:text-left">
          {/* 移动端：白底圆形校徽在深蓝上很跳，比线条剪影更有"到校了"的感觉 */}
          <Emblem className="h-16 w-16 sm:hidden" />
          {/* 大字号要负字距（字越大越显松）；这是拉丁字母标题，收一点就够。
              中文副标题用 text-balance，避免在「复 / 盘」这种字中间断行。 */}
          <h1 className="text-display font-medium sm:text-hero">
            Study for DUTERS
          </h1>
          <p className="max-w-md text-sm text-balance text-white/85 sm:text-body">
            面向大连理工学生的学习台：计划 → 专注 → 打卡 → 复盘
          </p>
        </div>
      </section>
      <WaveDivider className="h-12 w-full sm:h-14" />

      <div className="mx-auto flex w-full max-w-2xl sm:max-w-3xl flex-col items-center gap-8 px-6 pt-8 pb-10 sm:pt-10">
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
              {/* 水彩玉兰在 48px 下细节会糊成一团，所以给它一个淡底托住，
                  读起来像"一幅小画"而不是一条脏边 */}
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-dut-mist/60">
                <MagnoliaArt className="h-11 w-11" />
              </span>
              <div>
                <p className="text-body font-medium text-ink">{title}</p>
                <p className="mt-0.5 text-sm text-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* 一天的节奏：把四个功能翻译成"你的一天"，情绪价值落在这里——
            功能列表说服理性，日常叙事才让人想用。
            宽度与上面的卡片栅格一致（不再用 sm:max-w-lg 收窄），
            否则两条左边缘不齐，在平板宽度下尤其明显。 */}
        <section className="w-full">
          <h2 className="text-center text-sm font-medium tracking-tight text-ink">
            在大工的每一天
          </h2>
          <p className="mt-1 text-center text-meta text-muted sm:text-caption">
            凌水河边的四年，值得被认真记下来
          </p>

          <ol className="mt-6 flex w-full flex-col gap-0">
            {RHYTHM.map(([when, title, desc, color], i) => (
              // scroll-rise：滚到视口时上浮淡入（纯 CSS 的 view() 时间轴；
              // 不支持的浏览器里这条规则整体不生效，内容照常显示，不会消失）。
              <li
                key={when}
                className="scroll-rise relative flex gap-4 pb-6 last:pb-0"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {/* 时间轴：竖线 + 节点。最后一个不画线，避免尾巴悬空 */}
                <div className="flex flex-col items-center">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
                  {i < RHYTHM.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-line" aria-hidden="true" />
                  )}
                </div>
                <div className="-mt-1 min-w-0">
                  <p className="text-meta tracking-widest text-muted">{when}</p>
                  <p className="mt-0.5 text-body font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 校训带：1949 是建校年。这里只做身份认同，不放任何官方声明口径的东西。 */}
        <section className="scroll-rise w-full rounded-xl bg-dut-mist px-5 py-6 text-center">
          <p className="text-page leading-relaxed font-medium tracking-[0.2em] text-dut-deep">
            海纳百川 · 自强不息
          </p>
          <p className="mt-2 text-xs tracking-[0.18em] text-dut/70">
            厚德笃学 · 知行合一
          </p>
          <p className="mt-3 text-meta tracking-widest text-muted">
            1949 — 至今
          </p>
        </section>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="press flex h-12 flex-1 items-center justify-center rounded-xl bg-dut text-body font-medium text-white"
          >
            开始使用
          </Link>
          <Link
            href="/login"
            className="press flex h-12 flex-1 items-center justify-center rounded-xl bg-white text-body text-dut ring-1 ring-line"
          >
            登录
          </Link>
        </div>

        <p className="max-w-sm px-2 text-center text-xs leading-relaxed text-muted">
          面向 DUT 学生的个人开源项目，非官方。
          <br />
          模型由使用者自行配置，平台不预置任何密钥。
        </p>
      </div>
    </main>
  );
}
