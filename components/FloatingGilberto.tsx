"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, X } from "lucide-react";
import GilbertoChat from "@/components/GilbertoChat";

export default function FloatingGilberto() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (pathname.startsWith("/gilberto")) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 hidden md:block">
      {open && (
        <div className="mb-3 w-[420px] max-w-[calc(100vw_-_17rem)]">
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-neutral-950 text-neutral-400 shadow-xl transition-colors hover:bg-neutral-900 hover:text-neutral-100"
              title="Cerrar Gilberto"
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
          <GilbertoChat className="h-[min(680px,calc(100vh-7rem))] max-w-none" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="ml-auto flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-neutral-100 text-neutral-950 shadow-2xl transition-colors hover:bg-white"
        title={open ? "Ocultar Gilberto" : "Abrir Gilberto"}
      >
        <Bot size={20} strokeWidth={1.8} />
      </button>
    </div>
  );
}
