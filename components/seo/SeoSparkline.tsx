"use client";

export default function SeoSparkline({
  values,
  color = "#7dd3fc",
  invert = false,
}: {
  values: number[];
  color?: string;
  invert?: boolean;
}) {
  if (values.length < 2) {
    return <div className="h-16 rounded-md bg-neutral-800/60" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.0001, max - min);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const ratio = (value - min) / span;
    const y = invert ? ratio * 100 : 100 - ratio * 100;
    return `${x},${y}`;
  });
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points.join(" ")} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
