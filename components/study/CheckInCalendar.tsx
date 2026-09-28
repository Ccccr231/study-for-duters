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
    return { key, isFuture: ts > end, isToday: ts === end, checked: checked.has(key) };
  });

  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        gridAutoFlow: "column",
      }}
    >
      {cells.map((cell) => (
        <div
          key={cell.key}
          title={cell.key}
          className={`aspect-square rounded-[3px] ${
            cell.isFuture
              ? "bg-transparent"
              : cell.checked
                ? "bg-dut"
                : "bg-dut-mist"
          } ${cell.isToday ? "ring-1 ring-dut-deep" : ""}`}
        />
      ))}
    </div>
  );
}
