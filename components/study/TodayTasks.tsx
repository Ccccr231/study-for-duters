import { deleteTaskAction, toggleTaskAction } from "@/lib/actions/study";

type TaskItem = { id: string; title: string };

// 服务端渲染 + Server Action，勾选不需要 JS。
export function TodayTasks({ tasks }: { tasks: TaskItem[] }) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 py-2.5">
          <form action={toggleTaskAction} className="flex flex-1 items-center gap-3">
            <input type="hidden" name="taskId" value={task.id} />
            <button
              type="submit"
              aria-label={`完成「${task.title}」`}
              className="h-5 w-5 shrink-0 rounded-full border border-line transition-colors hover:border-dut"
            />
            <span className="text-[15px] text-ink">{task.title}</span>
          </form>
          <form action={deleteTaskAction}>
            <input type="hidden" name="taskId" value={task.id} />
            <button type="submit" className="text-xs text-muted" aria-label="删除任务">
              删除
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
