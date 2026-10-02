"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishPomodoroAction } from "@/lib/actions/study";

const DEFAULT_MINUTES = 25;
const SIZE = 220;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

type TaskOption = { id: string; title: string };

export function PomodoroTimer({ tasks }: { tasks: TaskOption[] }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [taskId, setTaskId] = useState<string>("");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(DEFAULT_MINUTES * 60);
  const [saving, setSaving] = useState(false);
  const startedAtRef = useRef<Date | null>(null);
  // 用 ref 而不是 saving state 做重入锁：同一事件循环里连点两次时，
  // state 还没重渲染，两次调用都会读到 saving === false，会重复落库两条记录。
  const savingRef = useRef(false);

  const total = minutes * 60;

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(timer);
        setEndsAt(null);
        void finish(true);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  async function finish(completed: boolean) {
    if (!startedAtRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const fd = new FormData();
    fd.set("startedAt", startedAtRef.current.toISOString());
    fd.set("completed", completed ? "1" : "0");
    if (taskId) fd.set("taskId", taskId);

    try {
      await finishPomodoroAction(fd);
      startedAtRef.current = null;
    } finally {
      savingRef.current = false;
      setSaving(false);
      router.refresh();
    }
  }

  function start() {
    if (endsAt !== null) return;
    startedAtRef.current = new Date();
    setEndsAt(Date.now() + minutes * 60_000);
  }

  function pause() {
    if (endsAt === null) return;
    setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    setEndsAt(null);
  }

  function resume() {
    if (endsAt !== null) return;
    if (!startedAtRef.current) startedAtRef.current = new Date(Date.now() - (total - remaining) * 1000);
    setEndsAt(Date.now() + remaining * 1000);
  }

  function reset() {
    setEndsAt(null);
    startedAtRef.current = null;
    setRemaining(minutes * 60);
  }

  const running = endsAt !== null;
  const started = startedAtRef.current !== null;
  const progress = 1 - remaining / total;
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--dut-blue-mist)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--dut-blue)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.max(0, Math.min(1, progress)))}
            // 计时推进是匀速运动，用 linear 正确；但"放弃/重置"是状态跳变，
            // 用同一条 linear 会让圆环像时间倒流，所以两种场景分开给缓动。
            style={{
              transition: running
                ? "stroke-dashoffset 200ms linear"
                : "stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[44px] leading-none font-medium tracking-tight tabular-nums text-dut-deep">
            {mm}:{ss}
          </p>
          <p className="mt-2 text-xs tracking-wide text-muted">
            {running ? "专注中" : started ? "已暂停" : "准备开始"}
          </p>
        </div>
      </div>

      {tasks.length > 0 && (
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          disabled={started}
          className="h-11 w-full max-w-xs rounded-lg border border-line bg-white px-3 text-[15px] outline-none transition-colors duration-150 focus:border-dut disabled:opacity-60"
        >
          <option value="">不关联任务</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-3">
        {!started && (
          <>
            {[25, 45].map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMinutes(m);
                  setRemaining(m * 60);
                }}
                className={`press h-10 rounded-lg px-4 text-sm ring-1 transition-colors duration-150 ${
                  minutes === m
                    ? "bg-dut text-white ring-dut"
                    : "bg-white text-muted ring-line"
                }`}
              >
                {m} 分钟
              </button>
            ))}
          </>
        )}

        {!running && !started && (
          <button
            onClick={start}
            className="press h-10 rounded-lg bg-dut px-6 text-sm font-medium text-white"
          >
            开始
          </button>
        )}
        {!running && started && (
          <>
            <button
              onClick={resume}
              className="press h-10 rounded-lg bg-dut px-6 text-sm font-medium text-white"
            >
              继续
            </button>
            <button
              onClick={() => void finish(false)}
              disabled={saving}
              className="press h-10 rounded-lg bg-white px-4 text-sm text-muted ring-1 ring-line transition-colors duration-150 hover:text-ink disabled:opacity-50"
            >
              结束并记录
            </button>
          </>
        )}
        {running && (
          <button
            onClick={pause}
            className="press h-10 rounded-lg bg-white px-6 text-sm text-ink ring-1 ring-line transition-colors duration-150 hover:bg-surface"
          >
            暂停
          </button>
        )}
        {started && (
          <button
            onClick={reset}
            disabled={saving}
            className="press h-10 rounded-lg px-4 text-sm text-muted disabled:opacity-50"
          >
            放弃
          </button>
        )}
      </div>

      {saving && (
        <p role="status" className="text-xs text-muted">
          正在记录…
        </p>
      )}
    </div>
  );
}
