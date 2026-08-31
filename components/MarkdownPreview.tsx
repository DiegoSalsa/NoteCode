"use client";

import { parseMarkdown } from "@/lib/markdown";

export default function MarkdownPreview({ content }: { content: string }) {
  const parsed = parseMarkdown(content || "");
  return (
    <div className="space-y-3">
      {parsed.toc.length > 2 && (
        <nav aria-label="Tabla de contenidos" className="rounded-lg border border-white/10 bg-neutral-950 px-3 py-2 text-[12px] text-neutral-400">
          <p className="mb-1 font-semibold uppercase tracking-wide text-neutral-500">Contenido</p>
          <ol className="space-y-1">
            {parsed.toc.map((item) => (
              <li key={item.id} className={item.level === 1 ? "" : "pl-3"}>
                <a href={`#${item.id}`} className="hover:text-neutral-200">{item.text}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="prose-notecode text-[14px] leading-6 text-neutral-300 [&_a]:text-sky-400 [&_code]:rounded [&_code]:bg-neutral-950 [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-neutral-950 [&_pre]:p-3" dangerouslySetInnerHTML={{ __html: parsed.html }} />
    </div>
  );
}
