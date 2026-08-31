export type SortDir = "asc" | "desc";

export function compareValues(a: unknown, b: unknown, dir: SortDir = "asc") {
  const left = a ?? "";
  const right = b ?? "";
  const result = String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
  return dir === "asc" ? result : -result;
}

export function persistOrder<T extends { id: string; sortOrder?: number }>(items: T[], orderedIds: string[]) {
  return items.map((item) => {
    const index = orderedIds.indexOf(item.id);
    return { ...item, sortOrder: index >= 0 ? index : item.sortOrder ?? 0 };
  });
}

export function applyFilters<T extends Record<string, unknown>>(items: T[], filters: Partial<Record<keyof T, string | boolean | null | undefined>>) {
  return items.filter((item) =>
    Object.entries(filters).every(([key, expected]) => {
      if (expected === undefined || expected === null || expected === "" || expected === "all") return true;
      return String(item[key]) === String(expected);
    }),
  );
}
