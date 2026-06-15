import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    // Clean existing data
    await prisma.note.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.credential.deleteMany();
    await prisma.project.deleteMany();
    await prisma.client.deleteMany();

    // Clients
    const client1 = await prisma.client.create({
        data: {
            name: "Grupo Élite",
            email: "contacto@grupoelite.com",
            phone: "+52 55 1234 5678",
            company: "Grupo Élite S.A.",
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

    // Projects
    await prisma.project.createMany({
        data: [
            { name: "Rediseño Web Corporativa", description: "Nuevo sitio web institucional con diseño responsive", status: "En progreso", clientId: client1.id },
            { name: "App Móvil E-Commerce", description: "Aplicación nativa iOS y Android con carrito de compras", status: "Revisión", clientId: client2.id },
            { name: "Dashboard Analytics", description: "Panel de control con gráficos de datos en tiempo real", status: "En progreso", clientId: client3.id },
            { name: "Landing Page Producto", description: "Página de aterrizaje para lanzamiento de producto SaaS", status: "Completado", clientId: client4.id },
            { name: "Integración API Pasarela", description: "Conexión con Stripe y OpenPay para procesamiento de pagos", status: "En progreso", clientId: client5.id },
            { name: "Sistema de Inventario", description: "Gestión interna de stock y almacenes", status: "En progreso", clientId: client1.id },
            { name: "Portal de Clientes", description: "Área privada para clientes con seguimiento de proyectos", status: "Planificado", clientId: client3.id },
            { name: "Automatización de Reportes", description: "Generación automática de reportes PDF semanales", status: "Completado", clientId: client5.id },
        ],
    });

    // Credentials
    await prisma.credential.createMany({
        data: [
            { title: "AWS Producción", service: "Amazon Web Services", username: "admin@purocode", password: "s3cur3-p4ss-2024", url: "https://aws.amazon.com", notes: "Cuenta principal de producción" },
            { title: "GitHub Org", service: "GitHub", username: "purocode-dev", password: "gh-t0k3n-pl4c3h0ld3r", url: "https://github.com/purocode", notes: "Organización principal" },
            { title: "Vercel Deploy", service: "Vercel", username: "deploy@purocode.dev", password: "v3rc3l-d3pl0y-k3y", url: "https://vercel.com/purocode" },
            { title: "Stripe API", service: "Stripe", username: "sk_live_purocode", password: "sk_live_xxxxxxxxxxxxx", notes: "Clave de producción para pagos" },
            { title: "SendGrid", service: "SendGrid", username: "apikey", password: "SG.xxxxxxxxxxxxx", url: "https://app.sendgrid.com", notes: "API de correos transaccionales" },
            { title: "Google Cloud", service: "Google Cloud Platform", username: "admin@purocode.dev", password: "gcp-s3rv1c3-4cc0unt", url: "https://console.cloud.google.com" },
            { title: "Cloudflare DNS", service: "Cloudflare", username: "admin@purocode.dev", password: "cf-dns-m4n4g3r", url: "https://dash.cloudflare.com" },
            { title: "DigitalOcean", service: "DigitalOcean", username: "devops@purocode", password: "d0-dr0pl3t-t0k3n", url: "https://cloud.digitalocean.com", notes: "Servidores de staging" },
        ],
    });

    // Invoices
    await prisma.invoice.createMany({
        data: [
            { number: "INV-2024-001", client: "Grupo Élite", amount: 45000, status: "Pagado", dueDate: new Date("2024-06-15"), paidAt: new Date("2024-06-10") },
            { number: "INV-2024-002", client: "TechNova", amount: 28000, status: "Pagado", dueDate: new Date("2024-07-01"), paidAt: new Date("2024-06-28") },
            { number: "INV-2024-003", client: "DataFlow", amount: 35000, status: "Pendiente", dueDate: new Date("2024-07-15") },
            { number: "INV-2024-004", client: "StartupXYZ", amount: 12000, status: "Pagado", dueDate: new Date("2024-07-20"), paidAt: new Date("2024-07-18") },
            { number: "INV-2024-005", client: "FinServ", amount: 52000, status: "Pendiente", dueDate: new Date("2024-08-01") },
            { number: "INV-2024-006", client: "TechNova", amount: 19000, status: "Pendiente", dueDate: new Date("2024-08-10") },
            { number: "INV-2024-007", client: "Grupo Élite", amount: 33000, status: "Pagado", dueDate: new Date("2024-08-15"), paidAt: new Date("2024-08-12") },
        ],
    });

    // Notes
    await prisma.note.createMany({
        data: [
            { title: "Onboarding nuevos devs", content: "1. Configurar acceso a GitHub\n2. Crear cuenta en AWS IAM\n3. Invitar a Slack y ClickUp\n4. Compartir documentación del monorepo", folder: "Procesos" },
            { title: "Arquitectura Frontend 2024", content: "Stack definido:\n- Next.js 14 App Router\n- Tailwind CSS\n- Shadcn/ui components\n- Zustand para estado global\n- React Query para fetching", folder: "Tech" },
            { title: "Reunión semanal - Junio 15", content: "Temas:\n- Revisión de sprints activos\n- Planning de capacity para Q3\n- Demo de nuevo dashboard analytics\n- Feedback de cliente Grupo Élite", folder: "Reuniones" },
            { title: "Ideas de mejora UX", content: "- Agregar skeleton loaders\n- Mejorar animaciones de transición\n- Implementar atajos de teclado (⌘K)\n- Modo oscuro automático", folder: "General" },
        ],
    });

    console.log("Seed completado exitosamente.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });