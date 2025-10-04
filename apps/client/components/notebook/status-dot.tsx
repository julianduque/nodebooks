import clsx from "clsx";

export interface StatusDotProps {
  colorClass: string;
  label: string;
  text?: string;
  showText?: boolean;
}

const StatusDot = ({
  colorClass,
  label,
  text,
  showText = false,
}: StatusDotProps) => (
  <span className="flex items-center gap-1" title={label}>
    <span
      className={clsx("h-2.5 w-2.5 rounded-full transition-colors", colorClass)}
      aria-hidden="true"
    />
    {showText ? (
      <span>{text ?? label}</span>
    ) : (
      <span className="sr-only">{label}</span>
    )}
  </span>
);

export default StatusDot;
