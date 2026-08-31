"use client";

import { useRef, useState } from "react";
import { newIdempotencyKey } from "@/lib/http";

export function useSavingAction() {
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const keys = useRef<Record<string, string>>({});

  function keyFor(action: string) {
    if (!keys.current[action]) keys.current[action] = newIdempotencyKey();
    return keys.current[action];
  }

  function resetKey(action: string) {
    delete keys.current[action];
  }

  async function run<T>(action: string, fn: (idempotencyKey: string) => Promise<T>, successMessage?: string) {
    if (saving) return null;
    setSaving(action);
    setError("");
    try {
      const result = await fn(keyFor(action));
      resetKey(action);
      if (successMessage) setNotice(successMessage);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar.");
      return null;
    } finally {
      setSaving(null);
    }
  }

  return { saving, notice, error, setError, setNotice, run, keyFor };
}
