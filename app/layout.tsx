import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
    title: "PuroCode",
    description:
        "Sistema operativo interno para gestión de proyectos, notas y credenciales.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" className="bg-neutral-950">
            <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen font-sans">
                <Sidebar />
                <main className="ml-60 min-h-screen">
                    {children}
                </main>
            </body>
        </html>
    );
}