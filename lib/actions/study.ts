"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 当天 00:00。
 * 已知简化：按 UTC 切日，不是用户本地时区。面向单校区场景够用，
 * v2 若要跨时区，改成把用户时区存进 UserSetting 再按偏移切日。
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

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

/** 结束一次专注并落库。duration 由服务端按 startedAt 计算，不信前端传的时长。 */
export async function finishPomodoroAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const startedAtRaw = String(formData.get("startedAt") ?? "");
  const taskId = String(formData.get("taskId") ?? "") || null;
  const completed = formData.get("completed") === "1";

  const startedAt = new Date(startedAtRaw);
  if (Number.isNaN(startedAt.getTime())) return;

  const duration = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000));

  await prisma.pomodoroSession.create({
    data: {
      userId: user.id,
      taskId,
      startedAt,
      endedAt: new Date(),
      duration,
      completed,
    },
  });
  refresh();
}

/* ---------------- 打卡 ---------------- */

export async function checkInAction(): Promise<void> {
  const user = await requireUser();
  const today = startOfToday();

  const existing = await prisma.checkIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
    select: { id: true },
  });
  if (existing) return; // 幂等：同一天重复点不改变数据

  const yesterday = new Date(today.getTime() - DAY_MS);
  const prev = await prisma.checkIn.findUnique({
    where: { userId_date: { userId: user.id, date: yesterday } },
    select: { streak: true },
  });

  await prisma.checkIn.create({
    data: { userId: user.id, date: today, streak: (prev?.streak ?? 0) + 1 },
  });
  refresh();
}
