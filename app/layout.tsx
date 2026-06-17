import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
    title: "NoteCode",
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
