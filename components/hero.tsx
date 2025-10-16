import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TerminalPanel } from "@/components/terminal-panel";
import { cn } from "@/lib/utils";

interface HeroProps {
  className?: string;
}

export function Hero({ className }: HeroProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background",
        className,
      )}
    >
      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-10 px-4 pb-24 pt-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/assets/nodebooks-logo.svg"
            alt="NodeBooks logo"
            width={120}
            height={120}
            className="h-20 w-20 drop-shadow-md sm:h-24 sm:w-24"
            priority
          />
          <h1 className="mt-6 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            NodeBooks{" "}
            <span className="block text-[clamp(2rem,4vw+1rem,3.75rem)] font-light text-primary">
              Interactive Node.js Notebooks
            </span>
          </h1>
          <h2 className="mt-4 max-w-2xl text-balance text-lg font-medium text-muted-foreground sm:text-xl">
            Notebook workflows for JavaScript teams, built on Node.js.
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Collaborate live on rich notebooks, stream outputs together, and publish finished work
            as shareable sites.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="gap-2">
              <Link href="#install">
                Get Started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link
                href="https://github.com/julianduque/nodebooks"
                target="_blank"
                rel="noreferrer"
              >
                <Github className="h-5 w-5" aria-hidden="true" />
                GitHub
              </Link>
            </Button>
          </div>
        </div>
        <div id="install" className="w-full">
          <TerminalPanel />
        </div>
      </div>
    </section>
  );
}
