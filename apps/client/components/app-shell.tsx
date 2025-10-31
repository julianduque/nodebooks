"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@nodebooks/client-ui/lib/utils";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Button, Separator } from "@nodebooks/client-ui/components/ui";
import ProfileMenu from "@/components/profile/profile-menu";
import {
  LayoutDashboard,
  NotebookPen,
  LayoutTemplate,
  Settings,
  Plus as PlusIcon,
  PanelLeft,
} from "lucide-react";
import { gravatarUrlForEmail } from "@/lib/avatar";
import type { WorkspaceRole } from "@/components/notebook/types";

type NavId = "home" | "notebooks" | "templates" | "settings";

interface NavItem {
  id: NavId;
  label: string;
  icon: ReactNode;
  href: Route;
}

const navItems: NavItem[] = [
  {
    id: "home",
    label: "Home",
    icon: <LayoutDashboard className="h-4 w-4" />,
    href: "/",
  },
  {
    id: "notebooks",
    label: "Notebooks",
    icon: <NotebookPen className="h-4 w-4" />,
    href: "/notebooks",
  },
  {
    id: "templates",
    label: "Templates",
    icon: <LayoutTemplate className="h-4 w-4" />,
    href: "/templates",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings className="h-4 w-4" />,
    href: "/settings",
  },
];

const SECONDARY_SIDEBAR_DEFAULT_WIDTH = 340;
const SECONDARY_SIDEBAR_MIN_WIDTH = 240;
const SECONDARY_SIDEBAR_MAX_WIDTH = 640;

type AccountInfo = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  role?: WorkspaceRole;
} | null;

interface AppShellProps {
  active?: NavId | string;
  onNavigate?: (id: NavId) => void;
  onNewNotebook?: () => void;
  title?: string;
  children: ReactNode;
  // Optional secondary left sidebar (e.g., notebook outline)
  secondarySidebar?: ReactNode;
  // Optional controls to render in the secondary sidebar header row
  secondaryHeader?: ReactNode;
  // Collapse the primary sidebar by default
  defaultCollapsed?: boolean;
  // Optional custom content in top toolbar, left side (after separators)
  headerMain?: ReactNode;
  // Optional custom right-aligned actions in top toolbar
  headerRight?: ReactNode;
  user?: {
    name: string;
    email: string;
    avatarUrl?: string | null;
    role?: WorkspaceRole;
  } | null;
  userLoading?: boolean;
  onLogout?: () => void;
}

const AppShell = ({
  active,
  onNavigate,
  onNewNotebook,
  title,
  children,
  secondarySidebar,
  secondaryHeader,
  defaultCollapsed = false,
  headerMain,
  headerRight,
  user,
  userLoading,
  onLogout,
}: AppShellProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(false);
  const [secondaryWidth, setSecondaryWidth] = useState(
    SECONDARY_SIDEBAR_DEFAULT_WIDTH
  );
  const [isResizingSecondary, setIsResizingSecondary] = useState(false);
  const pathname = usePathname?.() ?? "";
  const router = useRouter?.();
  const secondarySidebarRef = useRef<HTMLDivElement | null>(null);

  const [account, setAccount] = useState<AccountInfo>(user ?? null);
  const [accountLoading, setAccountLoading] = useState(
    user !== undefined ? Boolean(userLoading) : true
  );
  const accountRole: WorkspaceRole | null = account?.role ?? user?.role ?? null;
  const isAdminAccount = accountRole === "admin";
  const filteredNavItems = useMemo(() => {
    return isAdminAccount
      ? navItems
      : navItems.filter((item) => item.id === "notebooks");
  }, [isAdminAccount]);
  const canCreateNotebook = Boolean(onNewNotebook) && isAdminAccount;

  const toggleSecondarySidebar = useCallback(() => {
    setIsResizingSecondary(false);
    setSecondaryCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (user !== undefined) {
      setAccount(user);
      setAccountLoading(Boolean(userLoading));
      return;
    }

    let cancelled = false;
    const loadAccount = async () => {
      setAccountLoading(true);
      try {
        const response = await fetch("/auth/me", {
          headers: { Accept: "application/json" },
        });
        if (cancelled) {
          return;
        }
        if (response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            data?: {
              name?: string | null;
              email?: string | null;
              avatarUrl?: string | null;
              role?: WorkspaceRole;
            };
          };
          setAccount(payload?.data ? { ...payload.data } : null);
        } else {
          setAccount(null);
        }
      } catch {
        if (!cancelled) {
          setAccount(null);
        }
      } finally {
        if (!cancelled) {
          setAccountLoading(false);
        }
      }
    };

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading]);

  const handleLogout = useCallback(async () => {
    if (onLogout) {
      await onLogout();
    } else {
      try {
        await fetch("/auth/logout", { method: "POST" });
      } catch {
        // ignore
      }
      try {
        router?.replace?.("/login");
        router?.refresh?.();
      } catch {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }
    setAccount(null);
  }, [onLogout, router]);

  const accountWithAvatar = useMemo<AccountInfo>(() => {
    if (!account) {
      return null;
    }
    if (account.avatarUrl) {
      return account;
    }
    if (account.email) {
      const avatar = gravatarUrlForEmail(account.email, 96);
      if (avatar) {
        return { ...account, avatarUrl: avatar };
      }
    }
    return account;
  }, [account]);

  const handleSecondaryResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (secondaryCollapsed) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setIsResizingSecondary(true);
    },
    [secondaryCollapsed]
  );

  useEffect(() => {
    if (!isResizingSecondary || secondaryCollapsed) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!secondarySidebarRef.current) {
        return;
      }
      const rect = secondarySidebarRef.current.getBoundingClientRect();
      const proposedWidth = event.clientX - rect.left;
      setSecondaryWidth(
        Math.min(
          Math.max(proposedWidth, SECONDARY_SIDEBAR_MIN_WIDTH),
          SECONDARY_SIDEBAR_MAX_WIDTH
        )
      );
    };

    const stopResizing = () => {
      setIsResizingSecondary(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResizing);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResizing);
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingSecondary, secondaryCollapsed]);

  const handleResizeHandleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (secondaryCollapsed) {
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 16 : -16;
        setSecondaryWidth((current) =>
          Math.min(
            Math.max(current + delta, SECONDARY_SIDEBAR_MIN_WIDTH),
            SECONDARY_SIDEBAR_MAX_WIDTH
          )
        );
      }
      if (event.key === "Home") {
        event.preventDefault();
        setSecondaryWidth(SECONDARY_SIDEBAR_MIN_WIDTH);
      }
      if (event.key === "End") {
        event.preventDefault();
        setSecondaryWidth(SECONDARY_SIDEBAR_MAX_WIDTH);
      }
    },
    [secondaryCollapsed]
  );

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "flex h-screen shrink-0 border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear flex-col",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex h-16 items-center gap-3 px-3">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="rounded-md p-1 hover:bg-sidebar-accent"
            >
              <Image
                src="/assets/nodebooks-logo.svg"
                alt="NodeBooks"
                width={32}
                height={32}
                priority
              />
            </button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4" />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
              <div className="flex items-center gap-2">
                <Image
                  src="/assets/nodebooks-logo.svg"
                  alt="NodeBooks"
                  width={32}
                  height={32}
                  priority
                />
                <div className="leading-tight">
                  <p className="text-sm font-semibold tracking-tight">
                    NodeBooks
                  </p>
                  <p className="text-[10px] text-muted-foreground">Workspace</p>
                </div>
              </div>
            </>
          )}
        </div>
        <Separator className="mb-2" />
        <div className="flex-1 px-2">
          {!collapsed && (
            <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              General
            </div>
          )}
          <nav className="flex flex-col gap-1">
            {filteredNavItems.map((item) => {
              const isActive = onNavigate
                ? active === item.id
                : pathname === item.href;
              const content = (
                <span
                  className={cn(
                    "flex h-9 w-full items-center rounded-md px-2 text-sm transition-colors",
                    collapsed ? "justify-center" : "justify-start gap-2",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  aria-label={item.label}
                >
                  <span className="shrink-0 text-foreground/80">
                    {item.icon}
                  </span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>
              );
              return (
                <div key={item.id}>
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate?.(item.id)}
                      className="w-full text-left"
                    >
                      {content}
                    </button>
                  ) : (
                    <Link href={item.href} className="block">
                      {content}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
        <div className={cn("px-2 pb-4", collapsed && "px-1")}>
          <div
            className={cn(
              "flex flex-col gap-2",
              collapsed ? "items-center" : "items-stretch"
            )}
          >
            {canCreateNotebook ? (
              <Button
                className={cn(
                  collapsed ? "h-9 w-9 p-0" : "h-9 w-full justify-center gap-2"
                )}
                size={collapsed ? "icon" : "default"}
                variant="default"
                type="button"
                onClick={onNewNotebook}
                aria-label="Create new notebook"
                title="Create new notebook"
              >
                <PlusIcon className="h-4 w-4" />
                {!collapsed && <span className="text-sm">New notebook</span>}
              </Button>
            ) : null}
            <ProfileMenu
              user={accountWithAvatar}
              loading={accountLoading}
              collapsed={collapsed}
              onLogout={() => {
                void handleLogout();
              }}
            />
          </div>
        </div>
      </aside>
      {secondarySidebar ? (
        <>
          <aside
            ref={secondarySidebarRef}
            aria-hidden={secondaryCollapsed}
            className={cn(
              "h-screen shrink-0 border-r border-border bg-card py-6 lg:flex overflow-hidden transition-[width] duration-200 ease-linear",
              secondaryCollapsed ? "px-0" : "px-2",
              isResizingSecondary && "transition-none"
            )}
            style={{
              width: secondaryCollapsed ? 0 : secondaryWidth,
              minWidth: secondaryCollapsed ? 0 : SECONDARY_SIDEBAR_MIN_WIDTH,
              maxWidth: secondaryCollapsed ? 0 : SECONDARY_SIDEBAR_MAX_WIDTH,
            }}
          >
            <div className="flex h-full w-full flex-col">
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2 overflow-hidden">
                  {secondaryHeader}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">{secondarySidebar}</div>
            </div>
          </aside>
          {!secondaryCollapsed ? (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize secondary sidebar"
              className={cn(
                "group relative flex h-screen w-2 cursor-col-resize select-none touch-none items-center justify-center bg-border/30 transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:ring-offset-background lg:w-2.5",
                isResizingSecondary
                  ? "bg-border/70"
                  : "bg-border/30 hover:bg-border/60"
              )}
              onPointerDown={handleSecondaryResizeStart}
              onKeyDown={handleResizeHandleKeyDown}
              tabIndex={0}
            >
              <div className="pointer-events-none h-14 w-[4px] rounded-full bg-border transition group-hover:bg-border focus-visible:bg-border" />
            </div>
          ) : null}
        </>
      ) : null}
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 h-16 bg-background">
          <div className="relative flex h-full items-center gap-3 px-4 sm:gap-4">
            {secondarySidebar ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full border border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring/70"
                  onClick={toggleSecondarySidebar}
                  aria-label="Toggle Secondary Sidebar"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-6" />
              </>
            ) : null}
            {headerMain ? (
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                {headerMain}
              </div>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {title ?? ""}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">{headerRight}</div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default AppShell;
