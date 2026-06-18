"use client";

import { useEffect, useState } from "react";
import GilbertoChat from "@/components/GilbertoChat";

export default function GilbertoClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
    <div className="mx-auto flex h-[min(720px,calc(100vh-2rem))] w-full max-w-3xl items-center justify-center rounded-lg border border-white/10 bg-neutral-950 text-[13px] text-neutral-500">
      Cargando Gilberto...
    </div>
    );
  }

  return <GilbertoChat />;
}
