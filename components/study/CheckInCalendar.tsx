const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKS = 12;

// 12 周 × 7 天 = 84 格热力图。
// 没用 cal-heatmap：它是客户端图表库（带 d3 依赖），首屏要额外加载 JS，
// 而这里的数据量用 CSS grid 渲染即可，服务端直出、移动端也不会抖。
// 若以后要做 tooltip / 缩放交互，再换 cal-heatmap。
export function CheckInCalendar({
  days,
}: {
  /** 已打卡的日期（YYYY-MM-DD，UTC 日历日） */
  days: string[];
}) {
  const checked = new Set(days);
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

  // 对齐到 12 周前的周一（getUTCDay: 0=周日，转成周一起算）
  const end = todayUtc;
  const endDow = (new Date(end).getUTCDay() + 6) % 7;
  const lastMonday = end - endDow * DAY_MS;
  const start = lastMonday - (WEEKS - 1) * 7 * DAY_MS;

  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const ts = start + i * DAY_MS;
    const d = new Date(ts);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    return { key, ts, d, isFuture: ts > end, isToday: ts === end, checked: checked.has(key) };
  });

  // 每列（=每周）首格所在月份，用于在顶部标出月份变化。
  // 没有坐标标签时，手机上不能 hover、title 也看不到——用户根本不知道哪格是哪天，
  // 这个图就只剩装饰作用了。所以补齐行（周几）与列（月份）两组标签。
  const weekStarts = Array.from({ length: WEEKS }, (_, w) => cells[w * 7]);
  const monthLabels = weekStarts.map((cell, w) => {
    const d = new Date(cell.ts);
    const m = d.getUTCMonth() + 1;
    const prev = w > 0 ? new Date(weekStarts[w - 1].ts).getUTCMonth() + 1 : null;
    // 只在月份变化时标，且不是第一列（第一列的月份属于上一屏，标出来反而误导）
    return prev !== null && m !== prev ? `${m} 月` : "";
  });

  // 只在 一/三/五/日 四行给标签，避免 7 行文字挤在一起
  const ROW_LABELS = ["一", "", "三", "", "五", "", "日"];

  const totalChecked = cells.filter((c) => c.checked).length;

  return (
    <div className="w-full">
      {/* 给读屏一句话总览。84 个格子逐个读会没完没了，
          所以整张图对读屏是"一个图像 + 一段摘要"，细节靠 aria-label 按需查看。
          同时这段摘要也让键盘/触屏用户能一眼知道总数。 */}
      <p className="sr-only">
        最近 12 周打卡热力图，共打卡 {totalChecked} 天。
      </p>
      {/* 月份标签：与 12 列网格同构，保证对齐；左侧留出与行标签等宽的空白 */}
      <div className="mb-1 flex gap-1">
        <span className="w-6 shrink-0" aria-hidden="true" />
        <div
          className="grid flex-1 gap-1"
          style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        >
          {monthLabels.map((label, i) => (
            <span key={i} className="text-[10px] leading-none text-muted">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        {/* 星期标签 */}
        <div
          className="grid w-6 shrink-0 gap-1"
          style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
          aria-hidden="true"
        >
          {ROW_LABELS.map((label, i) => (
            <span
              key={i}
              className="flex items-center justify-center text-[10px] leading-none text-muted"
            >
              {label}
            </span>
          ))}
        </div>

        <div
          className="grid flex-1 gap-1"
          style={{
            gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            gridAutoFlow: "column",
          }}
        >
          {cells.map((cell) => {
            // 读屏原本只会读出裸日期（"2026-09-28"），既不自然也没说状态。
            // 这里给出人能听懂的标签；未来日期（本周末尾几格）不放进无障碍树，
            // 否则会读出一堆"还没到"的空格子。
            const label = `${cell.d.getUTCMonth() + 1} 月 ${cell.d.getUTCDate()} 日${
              cell.isFuture ? "" : cell.checked ? "，已打卡" : "，未打卡"
            }${cell.isToday ? "，今天" : ""}`;
            return (
              <div
                key={cell.key}
                title={cell.key}
                role={cell.isFuture ? undefined : "img"}
                aria-label={cell.isFuture ? undefined : label}
                aria-hidden={cell.isFuture ? true : undefined}
                className={`aspect-square rounded-[3px] ${
                  cell.isFuture
                    ? "bg-transparent"
                    : cell.checked
                      ? "bg-dut"
                      : "bg-dut-mist"
                } ${cell.isToday ? "ring-1 ring-dut-deep" : ""} ${
                  // 只给"今天且已打卡"这一格一次点亮动效：打卡后整页重渲染会自然重放。
                  // 不做 84 格级联——打卡页每天都开，历史格不变，级联会退化成噪声。
                  cell.isToday && cell.checked ? "cell-pop" : ""
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
