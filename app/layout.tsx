import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
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
        apple: [{ url: "/icons/app-icon-1024.png", sizes: "1024x1024", type: "image/png" }],
    },
    description:
        "Sistema operativo interno para gestión de proyectos, notas y credenciales.",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();

    return (
        <html lang="es" className="bg-neutral-950">
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
            </body>
        </html>
    );
}
