"use client";

import Link from "next/link";
import { prefetchJson } from "@/lib/client-cache";

export default function ProjectPrefetchLink({
  projectId,
  className,
  children,
}: {
  projectId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const href = `/proyectos/${projectId}`;

  function prefetchProject() {
    prefetchJson(`project:${projectId}`, `/api/projects/${projectId}`);
  }

  return (
    <Link
      href={href}
      onMouseEnter={prefetchProject}
      onTouchStart={prefetchProject}
      className={className}
    >
      {children}
    </Link>
  );
}
