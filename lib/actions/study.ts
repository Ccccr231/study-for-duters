"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { clampSessionMinutes, startOfToday } from "@/lib/date";

const DAY_MS = 24 * 60 * 60 * 1000;

function refresh() {
  revalidatePath("/today");
  revalidatePath("/plans");
  revalidatePath("/checkin");
}

/* ---------------- 计划 ---------------- */

export async function createPlanAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const goal = String(formData.get("goal") ?? "").trim();
  if (!title) return;

  const start = startOfToday();
  const end = new Date(start.getTime() + 30 * DAY_MS); // 默认 30 天

  await prisma.plan.create({
    data: { userId: user.id, title, goal: goal || null, startDate: start, endDate: end },
  });
  refresh();
}

export async function archivePlanAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const planId = String(formData.get("planId") ?? "");
  if (!planId) return;

  await prisma.plan.updateMany({
    where: { id: planId, userId: user.id },
    data: { status: "archived" },
  });
  refresh();
}

/* ---------------- 任务 ---------------- */

export async function createTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const planId = String(formData.get("planId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!planId || !title) return;

  const plan = await prisma.plan.findFirst({
    where: { id: planId, userId: user.id },
    select: { id: true },
  });
  if (!plan) return;

  const last = await prisma.task.findFirst({
    where: { planId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.task.create({
    data: { planId, userId: user.id, title, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  refresh();
}

export async function toggleTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId: user.id },
    select: { done: true },
  });
  if (!task) return;

  await prisma.task.update({ where: { id: taskId }, data: { done: !task.done } });
  refresh();
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  await prisma.task.deleteMany({ where: { id: taskId, userId: user.id } });
  refresh();
}

/* ---------------- 番茄钟 ---------------- */

/**
 * 结束一次专注并落库。
 *
 * 两个入口参数都来自浏览器，必须服务端自证：
 * 1) duration 由服务端按 startedAt 计算并**钳制上限**（见 clampSessionMinutes），
 *    不信前端传的时长——否则手改表单能灌任意大的 duration 进统计与报告；
 * 2) taskId 必须校验归属当前用户。PomodoroSession.taskId 在 schema 里没有外键，
 *    不校验就能把专注记录挂到别人的任务上。
 */
export async function finishPomodoroAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const startedAtRaw = String(formData.get("startedAt") ?? "");
  const taskId = String(formData.get("taskId") ?? "") || null;
  const completed = formData.get("completed") === "1";

  const startedAt = new Date(startedAtRaw);
  if (Number.isNaN(startedAt.getTime())) return;

  if (taskId) {
    const own = await prisma.task.findFirst({
      where: { id: taskId, userId: user.id },
      select: { id: true },
    });
    if (!own) return;
  }

  await prisma.pomodoroSession.create({
    data: {
      userId: user.id,
      taskId,
      startedAt,
      endedAt: new Date(),
      duration: clampSessionMinutes(startedAt),
      completed,
    },
  });
  refresh();
}

/* ---------------- 打卡 ---------------- */

/**
 * 打卡。幂等：同一天重复点不改变数据。
 *
 * 这里的 findUnique → create 是 check-then-act，两次并发请求（双击 / 重放）会同时
 * 通过上面的存在性检查，再由数据库 @@unique([userId, date]) 拦下第二个——不接住就抛 500。
 * 所以冲突按「已打卡」处理，而不是让用户看到错误页。
 */
export async function checkInAction(): Promise<void> {
  const user = await requireUser();
  const today = startOfToday();

  const existing = await prisma.checkIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
    select: { id: true },
  });
  if (existing) return;

  const yesterday = new Date(today.getTime() - DAY_MS);
  const prev = await prisma.checkIn.findUnique({
    where: { userId_date: { userId: user.id, date: yesterday } },
    select: { streak: true },
  });

  try {
    await prisma.checkIn.create({
      data: { userId: user.id, date: today, streak: (prev?.streak ?? 0) + 1 },
    });
  } catch (e) {
    // P2002 = 唯一约束冲突，等价于「这一天已经打过卡」，幂等处理。
    if ((e as { code?: string })?.code !== "P2002") throw e;
  }
  refresh();
}
