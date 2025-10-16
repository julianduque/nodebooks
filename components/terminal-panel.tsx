"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CommandBlock {
  label: string;
  lines: string[];
}

const HEROKU_DEPLOY_URL =
  "https://heroku.com/deploy?template=https://github.com/julianduque/nodebooks";

const commands: CommandBlock[] = [
  {
    label: "One-liner",
    lines: ["npx @nodebooks/cli"],
  },
  {
    label: "Global install",
    lines: ["npm install -g @nodebooks/cli", "nbks"],
  },
];

export function TerminalPanel({ className }: { className?: string }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function copyCommand(lines: string[], index: number) {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((value) => (value === index ? null : value)), 2000);
    } catch (error) {
      console.error("Failed to copy command", error);
    }
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-slate-900/90 text-slate-100 shadow-xl backdrop-blur",
        "before:absolute before:inset-x-0 before:-top-8 before:h-24 before:bg-primary/20 before:blur-2xl before:content-['']",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3 text-xs uppercase tracking-[0.35em] text-white/60">
        <span className="h-2 w-2 rounded-full bg-red-500/80" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" aria-hidden="true" />
        <span className="ml-auto font-medium">CLI</span>
      </div>
      <div className="grid gap-3 p-5 text-sm md:grid-cols-2">
        {commands.map((command, index) => (
          <div
            key={command.label}
            className="group rounded-xl border border-white/10 bg-slate-900/60 p-4"
          >
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-300/80">
              <span>{command.label}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-2 rounded-lg bg-white/5 px-3 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                onClick={() => copyCommand(command.lines, index)}
              >
                {copiedIndex === index ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <pre className="overflow-x-auto text-sm leading-6 text-slate-100">
              <code>
                {command.lines.map((line, lineIndex) => (
                  <div key={lineIndex} className="flex items-center gap-2">
                    <span className="select-none text-primary/80">❯</span>
                    <span>{line}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-sm text-slate-200/80">
        <span>Prefer a hosted setup? Deploy NodeBooks straight to Heroku.</span>
        <a href={HEROKU_DEPLOY_URL} target="_blank" rel="noreferrer" className="inline-flex">
          <Image
            src="https://www.herokucdn.com/deploy/button.svg"
            alt="Deploy to Heroku"
            width={190}
            height={60}
            className="h-10 w-auto"
            unoptimized
          />
        </a>
      </div>
    </div>
  );
}
