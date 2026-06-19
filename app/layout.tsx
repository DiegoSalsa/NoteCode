import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import PwaRegistration from "@/components/PwaRegistration";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
    title: "NoteCode",
    applicationName: "NoteCode",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: [
            { url: "/favicon.ico" },
            { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
            { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
            { url: "/brand/notecode-mark-white.svg", type: "image/svg+xml" },
        ],
        apple: [
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icons/app-icon-1024.png", sizes: "1024x1024", type: "image/png" },
        ],
    },
    appleWebApp: {
        capable: true,
        title: "NoteCode",
        statusBarStyle: "black-translucent",
    },
    formatDetection: {
        telephone: false,
    },
    other: {
        "apple-mobile-web-app-capable": "yes",
        "mobile-web-app-capable": "yes",
    },
    description:
        "Sistema operativo interno para gestión de proyectos, notas y credenciales.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: "#0a0a0a",
    colorScheme: "dark",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();

    return (
        <html lang="es" className="bg-neutral-950">
            <head>
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="mobile-web-app-capable" content="yes" />
            </head>
            <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen font-sans">
                <AppShell
                    user={
                        user
                            ? {
                                displayName: user.name,
                                email: user.email,
                            }
                            : null
                    }
                >
                    {children}
                </AppShell>
                <PwaRegistration />
            </body>
        </html>
    );
}
