import { cn } from "@/lib/utils";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  eyebrow?: string;
  description?: string;
  hideTitle?: boolean;
}

export function Section({
  title,
  eyebrow,
  description,
  className,
  hideTitle,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn("mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8", className)}
      {...props}
    >
      {(title || description || eyebrow) && (
        <header className="mx-auto max-w-3xl text-center">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}
          {title && !hideTitle ? (
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          ) : null}
          {description ? (
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">{description}</p>
          ) : null}
        </header>
      )}
      <div className="mt-12">{children}</div>
    </section>
  );
}
