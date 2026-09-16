export type RankEvent = {
  date: string;
  type: string;
  label: string;
};

type Point = { date: string; position: number | null; url: string | null };

function crossed(previous: number | null, current: number | null, threshold: number, entered: boolean) {
  if (entered) return (previous == null || previous > threshold) && current != null && current <= threshold;
  return previous != null && previous <= threshold && (current == null || current > threshold);
}

export function rankingEvents(points: Point[]): RankEvent[] {
  const events: RankEvent[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = index > 0 ? points[index - 1] : null;
    if (!current) continue;
    const prevPos = previous?.position ?? null;
    const pos = current.position;
    if (crossed(prevPos, pos, 100, true)) events.push({ date: current.date, type: "entered_top_100", label: "Entró Top 100" });
    if (crossed(prevPos, pos, 20, true)) events.push({ date: current.date, type: "entered_top_20", label: "Entró Top 20" });
    if (crossed(prevPos, pos, 10, true)) events.push({ date: current.date, type: "entered_top_10", label: "Entró Top 10" });
    if (crossed(prevPos, pos, 3, true)) events.push({ date: current.date, type: "entered_top_3", label: "Entró Top 3" });
    if (crossed(prevPos, pos, 10, false)) events.push({ date: current.date, type: "left_top_10", label: "Salió Top 10" });
    if (previous?.url && current.url && previous.url !== current.url) {
      events.push({ date: current.date, type: "url_changed", label: "URL cambió" });
    }
  }
  return events;
}
