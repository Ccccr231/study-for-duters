import { deleteTaskAction, toggleTaskAction } from "@/lib/actions/study";

type TaskItem = { id: string; title: string };

// 服务端渲染 + Server Action，勾选不需要 JS。
export function TodayTasks({ tasks }: { tasks: TaskItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 py-2.5">
          <form action={toggleTaskAction} className="flex min-w-0 flex-1 items-center gap-3">
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              aria-label={`完成「${task.title}」`}
              className="tap h-5 w-5 shrink-0 rounded-full border border-line transition-colors duration-150 hover:border-dut"
            />
            <span className="truncate text-[15px] text-ink">{task.title}</span>
          </form>
          <form action={deleteTaskAction} className="shrink-0">
            <input type="hidden" name="taskId" value={task.id} />
            {/* 删除既破坏性又长期可见，平时压低存在感，hover 时才升起来 */}
            <button
              type="submit"
              aria-label="删除任务"
              className="tap rounded-md px-1.5 py-1 text-xs text-muted/60 transition-colors duration-150 hover:text-amber"
            >
              删除
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
