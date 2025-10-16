"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";

import { Section } from "@/components/section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { screenshots } from "@/lib/content";

function modulo(index: number, length: number) {
  return (index + length) % length;
}

export function ScreenshotsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  const total = screenshots.length;

  const activeShot = useMemo(() => screenshots[modulo(activeIndex, total)], [activeIndex, total]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        setActiveIndex((index) => modulo(index + 1, total));
      }
      if (event.key === "ArrowLeft") {
        setActiveIndex((index) => modulo(index - 1, total));
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [total]);

  const goTo = (index: number) => setActiveIndex(modulo(index, total));
  const goNext = () => goTo(activeIndex + 1);
  const goPrev = () => goTo(activeIndex - 1);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (autoPlay && !isHovering) {
        setActiveIndex((index) => modulo(index + 1, total));
      }
    }, 15000);

    return () => window.clearInterval(interval);
  }, [autoPlay, isHovering, total]);

  return (
    <Section id="screenshots" eyebrow="Product Tour">
      <div className="relative mx-auto max-w-5xl">
        <div
          className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-background/95 to-background shadow-2xl backdrop-blur"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onFocusCapture={() => setIsHovering(true)}
          onBlurCapture={() => setIsHovering(false)}
        >
          <div
            className="absolute inset-x-[-20%] top-[-30%] h-48 rounded-full bg-primary/30 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-[10%] bottom-[-40%] h-56 rounded-full bg-primary/20 blur-3xl"
            aria-hidden="true"
          />

          <Card className="relative border-0 bg-transparent shadow-none">
            <CardHeader className="relative z-10 flex flex-col gap-2 text-primary-foreground">
              <CardTitle className="text-2xl font-semibold text-foreground sm:text-3xl">
                {activeShot.title}
              </CardTitle>
              <CardDescription
                className="max-w-2xl text-base text-muted-foreground sm:text-lg"
                aria-live="polite"
              >
                {activeShot.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-primary/20 bg-background/80 shadow-lg">
                <Image
                  key={activeShot.title}
                  src={activeShot.fileUrl}
                  alt={activeShot.title}
                  fill
                  className="object-cover transition-transform duration-700 ease-out will-change-transform"
                  sizes="(min-width: 1024px) 60vw, 90vw"
                  priority={activeIndex === 0}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-primary/30 via-transparent to-transparent opacity-40" />
              </div>
            </CardContent>
          </Card>

          <div className="relative z-20 flex items-center justify-between px-6 pb-8 pt-2">
            <div className="flex items-center gap-6 text-sm font-medium uppercase tracking-[0.3em] text-primary/80">
              <span>NodeBooks UI Preview</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary shadow-sm transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => setAutoPlay((value) => !value)}
                  aria-label={autoPlay ? "Pause auto advance" : "Resume auto advance"}
                  aria-pressed={autoPlay}
                >
                  {autoPlay ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-primary/15">
                  <span
                    key={`${activeIndex}-${autoPlay}`}
                    className={[
                      "absolute inset-y-0 left-0 h-full w-full origin-left rounded-full bg-gradient-to-r from-primary to-primary/70",
                      autoPlay ? "animate-carousel-progress" : "",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-20 flex items-center gap-2 px-6 pb-6">
            {screenshots.map((shot, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={shot.title}
                  type="button"
                  onClick={() => goTo(index)}
                  className="group flex-1"
                  aria-label={`Go to screenshot ${shot.title}`}
                >
                  <span
                    className={[
                      "block h-1.5 rounded-full transition-all duration-300",
                      isActive
                        ? "bg-gradient-to-r from-primary to-primary/60 shadow-[0_0_12px_rgba(59,130,246,0.35)]"
                        : "bg-primary/20 hover:bg-primary/40",
                    ].join(" ")}
                  />
                </button>
              );
            })}
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-3 z-30 flex items-center">
            <button
              type="button"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-lg transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={goPrev}
              aria-label="View previous screenshot"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-3 z-30 flex items-center">
            <button
              type="button"
              className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-lg transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              onClick={goNext}
              aria-label="View next screenshot"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
