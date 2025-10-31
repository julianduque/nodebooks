import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.js";
import { cn } from "../../lib/utils.js";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant" | "system";
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-start gap-3",
      from === "user"
        ? "is-user flex-row-reverse justify-end"
        : "is-assistant justify-start",
      className
    )}
    {...props}
  />
);

const messageContentVariants = cva(
  "flex flex-col gap-2 overflow-hidden rounded-xl text-sm transition-colors",
  {
    variants: {
      variant: {
        contained: [
          "max-w-[80%] border px-4 py-3 shadow-sm",
          "group-[.is-user]:ml-auto group-[.is-user]:bg-[color:var(--chat-user-surface)] group-[.is-user]:text-[color:var(--chat-user-foreground)] group-[.is-user]:border-[color:var(--chat-user-border)]",
          "group-[.is-assistant]:mr-auto group-[.is-assistant]:bg-[color:var(--chat-assistant-surface)] group-[.is-assistant]:text-[color:var(--chat-assistant-foreground)] group-[.is-assistant]:border-[color:var(--chat-assistant-border)]",
        ],
        flat: ["w-full text-foreground"],
      },
    },
    defaultVariants: {
      variant: "contained",
    },
  }
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>;

export const MessageContent = ({
  children,
  className,
  variant,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(messageContentVariants({ variant, className }))}
    {...props}
  >
    {children}
  </div>
);

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src?: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  children,
  ...props
}: MessageAvatarProps) => (
  <Avatar className={cn("size-8 ring-1 ring-border", className)} {...props}>
    {src && <AvatarImage alt="" className="mt-0 mb-0" src={src} />}
    <AvatarFallback>{children || name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
);
