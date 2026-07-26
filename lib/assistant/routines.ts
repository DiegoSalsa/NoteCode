import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { Prisma } from "@prisma/client";
import { notify } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/server-cache";
import { buildF29Snapshot } from "@/lib/tax/f29-service";
import { CHILE_TIME_ZONE } from "@/lib/tax/period";

const DEFAULT_ROUTINES = [
  {
    actionType: "morning-brief",
    name: "Resumen diario",
    description: "Resume pendientes, cobros, alertas y aprobaciones cada mañana.",
    schedule: "Diario 08:00",
    hour: 8,
  },
  {
    actionType: "tax-monitor",
    name: "Monitor F29 Chile",
    description: "Actualiza la proyección del F29 y avisa cambios o brechas tributarias.",
    schedule: "Diario 09:00",
    hour: 9,
  },
] as const;

function nextDailyRun(hour: number, now = new Date()) {
  const localDay = formatInTimeZone(now, CHILE_TIME_ZONE, "yyyy-MM-dd");
  let candidate = fromZonedTime(`${localDay}T${String(hour).padStart(2, "0")}:00:00`, CHILE_TIME_ZONE);
  if (candidate <= now) {
    const tomorrow = formatInTimeZone(addDays(fromZonedTime(`${localDay}T12:00:00`, CHILE_TIME_ZONE), 1), CHILE_TIME_ZONE, "yyyy-MM-dd");
    candidate = fromZonedTime(`${tomorrow}T${String(hour).padStart(2, "0")}:00:00`, CHILE_TIME_ZONE);
  }
  return candidate;
}

export async function ensureDefaultRoutines(userId: string) {
  return cached(`assistant:routines:${userId}`, 5 * 60_000, async () => {
    const existing = await prisma.assistantRoutine.findMany({
      where: { userId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    const existingTypes = new Set(existing.map((routine) => routine.actionType));
    const missing = DEFAULT_ROUTINES.filter((routine) => !existingTypes.has(routine.actionType));
    if (!missing.length) return existing;

    await Promise.all(missing.map((routine) =>
      prisma.assistantRoutine.upsert({
        where: { userId_actionType: { userId, actionType: routine.actionType } },
        create: {
          userId,
          actionType: routine.actionType,
          name: routine.name,
          description: routine.description,
          schedule: routine.schedule,
          timezone: CHILE_TIME_ZONE,
          nextRunAt: new Date(),
        },
        update: {},
      }),
    ));

    return prisma.assistantRoutine.findMany({
      where: { userId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
  });
}

export async function runDueAssistantRoutines(now = new Date(), options?: { forceUserId?: string }) {
  const routines = await prisma.assistantRoutine.findMany({
    where: {
      active: true,
      ...(options?.forceUserId ? { userId: options.forceUserId } : { nextRunAt: { lte: now } }),
    },
    orderBy: { nextRunAt: "asc" },
    take: 100,
  });
  let notifications = 0;

  for (const routine of routines) {
    try {
      const hour = routine.actionType === "tax-monitor" ? 9 : 8;
      if (!options?.forceUserId) {
        const claimed = await prisma.assistantRoutine.updateMany({
          where: { id: routine.id, active: true, nextRunAt: { lte: now } },
          data: { nextRunAt: nextDailyRun(hour, now) },
        });
        if (!claimed.count) continue;
      }
      let result: Record<string, unknown>;

      if (routine.actionType === "morning-brief") {
        const [overdueTasks, overdueInvoices, unreadAlerts, pendingApprovals] = await Promise.all([
          prisma.projectTask.count({ where: { status: { not: "Hecho" }, dueDate: { lt: now } } }),
          prisma.invoice.aggregate({
            where: { deletedAt: null, status: { in: ["Pendiente", "Parcial", "Vencido"] }, dueDate: { lt: now } },
            _count: true,
            _sum: { amount: true },
          }),
          prisma.notification.count({ where: { OR: [{ userId: routine.userId }, { userId: null }], readAt: null } }),
          prisma.assistantAction.count({ where: { userId: routine.userId, status: "pending", requiresApproval: true } }),
        ]);
        const invoiceAmount = overdueInvoices._sum.amount ?? 0;
        const message = `${overdueTasks} tareas vencidas · ${overdueInvoices._count} cobros vencidos por ${new Intl.NumberFormat("es-CL").format(invoiceAmount)} CLP · ${unreadAlerts} alertas · ${pendingApprovals} aprobaciones.`;
        await notify({ userId: routine.userId, type: "gilberto-daily-brief", title: "Tu resumen diario de Gilberto", message, href: "/hoy", severity: overdueTasks || overdueInvoices._count ? "warning" : "info" });
        notifications += 1;
        result = { overdueTasks, overdueInvoices: overdueInvoices._count, invoiceAmount, unreadAlerts, pendingApprovals };
      } else if (routine.actionType === "tax-monitor") {
        const period = formatInTimeZone(now, CHILE_TIME_ZONE, "yyyy-MM");
        const f29 = await buildF29Snapshot(period);
        const message = `F29 ${period}: ${new Intl.NumberFormat("es-CL").format(f29.estimatedTotal)} CLP estimados, vence ${f29.dueDateChile}. Confianza ${f29.confidence.toLowerCase()}; ${f29.gaps.length} brechas pendientes.`;
        await notify({ userId: routine.userId, type: "gilberto-tax-monitor", title: "Proyección F29 actualizada", message, href: `/impuestos?period=${period}`, severity: f29.gaps.length ? "warning" : "info" });
        notifications += 1;
        result = { period, estimatedTotal: f29.estimatedTotal, dueDateChile: f29.dueDateChile, confidence: f29.confidence, gaps: f29.gaps.length };
      } else {
        result = { skipped: true, reason: "Tipo de rutina no implementado." };
      }

      await prisma.assistantRoutine.update({
        where: { id: routine.id },
        data: { lastRunAt: now, nextRunAt: nextDailyRun(hour, now), lastResult: result as Prisma.InputJsonValue },
      });
      await prisma.auditEvent.create({
        data: {
          actorUserId: routine.userId,
          action: "RUN",
          entityType: "AssistantRoutine",
          entityId: routine.id,
          summary: `${routine.name} ejecutada`,
          metadata: result as Prisma.InputJsonValue,
        },
      });
      invalidateCache(`assistant:routines:${routine.userId}`);
      invalidateCache(`gilberto:today:${routine.userId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await prisma.assistantRoutine.update({
        where: { id: routine.id },
        data: { lastRunAt: now, nextRunAt: nextDailyRun(8, now), lastResult: { error: message } },
      });
      invalidateCache(`assistant:routines:${routine.userId}`);
      invalidateCache(`gilberto:today:${routine.userId}`);
    }
  }

  return { checked: routines.length, notifications };
}
