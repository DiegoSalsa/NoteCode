import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.note.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.personalSecret.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();

  const client1 = await prisma.client.create({
    data: {
      name: "Grupo Elite",
      email: "contacto@grupoelite.com",
      phone: "+52 55 1234 5678",
      company: "Grupo Elite S.A.",
    },
  });

  const client2 = await prisma.client.create({
    data: {
      name: "TechNova",
      email: "info@technova.io",
      phone: "+1 415 555 0199",
      company: "TechNova Inc.",
    },
  });

  const client3 = await prisma.client.create({
    data: {
      name: "DataFlow",
      email: "hello@dataflow.co",
      company: "DataFlow Analytics",
    },
  });

  const client4 = await prisma.client.create({
    data: {
      name: "StartupXYZ",
      email: "founders@startupxyz.com",
      company: "StartupXYZ",
    },
  });

  const client5 = await prisma.client.create({
    data: {
      name: "FinServ",
      email: "ops@finserv.mx",
      phone: "+52 81 9876 5432",
      company: "FinServ Soluciones",
    },
  });

  await prisma.project.createMany({
    data: [
      { name: "Rediseno Web Corporativa", description: "Nuevo sitio web institucional con diseno responsive", status: "En progreso", clientId: client1.id },
      { name: "App Movil E-Commerce", description: "Aplicacion nativa iOS y Android con carrito de compras", status: "Revision", clientId: client2.id },
      { name: "Dashboard Analytics", description: "Panel de control con graficos de datos en tiempo real", status: "En progreso", clientId: client3.id },
      { name: "Landing Page Producto", description: "Pagina de aterrizaje para lanzamiento de producto SaaS", status: "Completado", clientId: client4.id },
      { name: "Integracion API Pasarela", description: "Conexion con Stripe y OpenPay para procesamiento de pagos", status: "En progreso", clientId: client5.id },
      { name: "Sistema de Inventario", description: "Gestion interna de stock y almacenes", status: "En progreso", clientId: client1.id },
      { name: "Portal de Clientes", description: "Area privada para clientes con seguimiento de proyectos", status: "Planificado", clientId: client3.id },
      { name: "Automatizacion de Reportes", description: "Generacion automatica de reportes PDF semanales", status: "Completado", clientId: client5.id },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      { number: "INV-2024-001", client: "Grupo Elite", amount: 45000, status: "Pagado", dueDate: new Date("2024-06-15"), paidAt: new Date("2024-06-10") },
      { number: "INV-2024-002", client: "TechNova", amount: 28000, status: "Pagado", dueDate: new Date("2024-07-01"), paidAt: new Date("2024-06-28") },
      { number: "INV-2024-003", client: "DataFlow", amount: 35000, status: "Pendiente", dueDate: new Date("2024-07-15") },
      { number: "INV-2024-004", client: "StartupXYZ", amount: 12000, status: "Pagado", dueDate: new Date("2024-07-20"), paidAt: new Date("2024-07-18") },
      { number: "INV-2024-005", client: "FinServ", amount: 52000, status: "Pendiente", dueDate: new Date("2024-08-01") },
      { number: "INV-2024-006", client: "TechNova", amount: 19000, status: "Pendiente", dueDate: new Date("2024-08-10") },
      { number: "INV-2024-007", client: "Grupo Elite", amount: 33000, status: "Pagado", dueDate: new Date("2024-08-15"), paidAt: new Date("2024-08-12") },
    ],
  });

  await prisma.note.createMany({
    data: [
      {
        title: "Onboarding nuevos devs",
        content: "1. Configurar acceso a GitHub\n2. Crear cuenta en AWS IAM\n3. Invitar a Slack y ClickUp\n4. Compartir documentacion del monorepo",
        folder: "Procesos",
      },
      {
        title: "Arquitectura Frontend 2024",
        content: "Stack definido:\n- Next.js 14 App Router\n- Tailwind CSS\n- Shadcn/ui components\n- Zustand para estado global\n- React Query para fetching",
        folder: "Tech",
      },
      {
        title: "Reunion semanal - Junio 15",
        content: "Temas:\n- Revision de sprints activos\n- Planning de capacity para Q3\n- Demo de nuevo dashboard analytics\n- Feedback de cliente Grupo Elite",
        folder: "Reuniones",
      },
      {
        title: "Ideas de mejora UX",
        content: "- Agregar skeleton loaders\n- Mejorar animaciones de transicion\n- Implementar atajos de teclado\n- Modo oscuro automatico",
        folder: "General",
      },
    ],
  });

  console.log("Seed completado exitosamente.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
