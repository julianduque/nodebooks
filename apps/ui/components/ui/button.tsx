import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const baseStyles =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60";

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-brand-500 text-white hover:bg-brand-600",
  outline: "border border-slate-200 bg-white hover:bg-slate-100",
  secondary: "bg-slate-900 text-white hover:bg-slate-800",
  ghost: "hover:bg-slate-100",
  destructive: "bg-rose-600 text-white hover:bg-rose-700",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 rounded-sm px-3",
  md: "h-9 px-4",
  lg: "h-11 px-6 text-base",
  icon: "h-9 w-9",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", type = "button", ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
