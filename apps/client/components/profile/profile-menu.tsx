import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";

export interface ProfileUser {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface ProfileMenuProps {
  user: ProfileUser | null;
  loading?: boolean;
  collapsed?: boolean;
  showMenu?: boolean;
  onProfile?: () => void;
  onLogout?: () => void;
  className?: string;
}

const placeholderInitial = (user: ProfileUser | null) => {
  const source = user?.name?.trim() || user?.email?.trim() || "";
  return source.slice(0, 1).toUpperCase() || "?";
};

const ProfileMenu = ({
  user,
  loading = false,
  collapsed = false,
  showMenu = true,
  onProfile,
  onLogout,
  className,
}: ProfileMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [collapsed]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div
          className={cn(
            "animate-pulse rounded-md bg-muted/40",
            collapsed ? "h-9 w-9" : "h-[72px] w-full",
            className
          )}
        />
      );
    }

    if (!user) {
      return null;
    }

    const avatar = user.avatarUrl ? (
      <Image
        src={user.avatarUrl}
        alt={user.name ? `${user.name} avatar` : "Profile avatar"}
        width={32}
        height={32}
        className="h-8 w-8 rounded-full border border-border"
      />
    ) : (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold uppercase">
        {placeholderInitial(user)}
      </div>
    );

    if (!showMenu) {
      return (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border border-border bg-card/70 px-3 py-3",
            className
          )}
        >
          {avatar}
          <div className="min-w-0 text-sm">
            <p className="truncate font-semibold leading-tight">
              {user.name ?? user.email}
            </p>
            {user.email ? (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={menuRef}
        className={cn(
          "relative w-full",
          collapsed && "flex justify-center",
          className
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Open account menu"
          title={collapsed ? (user.name ?? user.email ?? undefined) : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-md border border-border bg-sidebar/70 px-2 py-2 text-left transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "h-9 w-9 justify-center border-none px-0"
          )}
        >
          {avatar}
          {!collapsed && (
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold leading-tight">
                {user.name ?? user.email}
              </p>
              {user.email ? (
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              ) : null}
            </div>
          )}
        </button>
        {open ? (
          <div
            className={cn(
              "absolute bottom-full left-0 z-50 mb-3 w-60 rounded-md border border-border bg-popover p-3 shadow-lg",
              collapsed && "left-1/2 w-60 -translate-x-1/2"
            )}
          >
            <div className="mb-3">
              <p className="text-sm font-semibold leading-snug">
                {user.name ?? user.email}
              </p>
              {user.email ? (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  onProfile?.();
                }}
              >
                Profile
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setOpen(false);
                  onLogout?.();
                }}
              >
                Log out
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }, [
    collapsed,
    className,
    loading,
    onLogout,
    onProfile,
    open,
    showMenu,
    user,
  ]);

  return content;
};

export default ProfileMenu;
