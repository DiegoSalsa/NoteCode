import { formatInTimeZone } from "date-fns-tz";
import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultRoutines } from "@/lib/assistant/routines";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";
import { buildF29Snapshot } from "@/lib/tax/f29-service";
import { CHILE_TIME_ZONE } from "@/lib/tax/period";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const canSeeFinance = canManageFinance(user);
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const data = await cached(`gilberto:today:${user.id}:${canSeeFinance}`, 60_000, async () => {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 86400000);
    const taxPeriod = formatInTimeZone(now, CHILE_TIME_ZONE, "yyyy-MM");
    const [tasks, invoices, notifications, actions, routines, activeProjects, f29] = await Promise.all([
      prisma.projectTask.findMany({
        where: { status: { not: "Hecho" }, OR: [{ dueDate: { lte: inSevenDays } }, { priority: "Alta" }] },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: 12,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, projectId: true, project: { select: { name: true } } },
      }),
      canSeeFinance
        ? prisma.invoice.findMany({
            where: { deletedAt: null, status: { in: ["Pendiente", "Parcial", "Vencido"] } },
            orderBy: { dueDate: "asc" },
            take: 10,
            select: { id: true, number: true, client: true, amount: true, status: true, dueDate: true },
          })
        : Promise.resolve([]),
      prisma.notification.findMany({
        where: { OR: [{ userId: user.id }, { userId: null }], readAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, type: true, title: true, message: true, severity: true, href: true, createdAt: true },
      }),
      prisma.assistantAction.findMany({
        where: { userId: user.id, status: { in: ["pending", "approved", "failed"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      ensureDefaultRoutines(user.id),
      prisma.project.count({ where: { deletedAt: null, status: { not: "Completado" } } }),
      canSeeFinance ? buildF29Snapshot(taxPeriod) : Promise.resolve(null),
    ]);

    const overdueTasks = tasks.filter((task) => task.dueDate && task.dueDate < now).length;
    const pendingAmount = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);

    return {
      generatedAt: now.toISOString(),
      timezone: CHILE_TIME_ZONE,
      summary: {
        activeProjects,
        tasks: tasks.length,
        overdueTasks,
        pendingInvoices: invoices.length,
        pendingAmount,
        unreadAlerts: notifications.length,
        pendingApprovals: actions.filter((action) => action.status === "pending" && action.requiresApproval).length,
      },
      tasks,
      invoices,
      notifications,
      actions,
      routines,
      f29,
    };
  }, { fresh });

  return NextResponse.json(data);
}
