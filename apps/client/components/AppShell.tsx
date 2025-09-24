"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/components/lib/utils";
import Link from "next/link";
import Image from "next/image";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  NotebookPen,
  LayoutTemplate,
  Settings,
  Plus,
  PanelLeft,
} from "lucide-react";

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
    label: "Dashboard",
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
}: AppShellProps) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(false);
  const pathname = usePathname?.() ?? "";

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "flex h-screen shrink-0 border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear flex-col",
          collapsed ? "w-12" : "w-56"
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
                width={28}
                height={28}
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
        <Separator className="mx-2 mb-2" />
        <div className="flex-1 px-2">
          {!collapsed && (
            <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              General
            </div>
          )}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
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
        <div
          className={cn("px-2 pb-4", collapsed && "px-1 flex justify-center")}
        >
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
            <Plus className="h-4 w-4" />
            {!collapsed && <span className="text-sm">New Notebook</span>}
          </Button>
        </div>
      </aside>
      {secondarySidebar ? (
        <aside
          className={cn(
            "hidden h-screen shrink-0 border-r border-slate-200 bg-white py-6 lg:flex overflow-hidden transition-[width] duration-200 ease-linear",
            secondaryCollapsed ? "w-0 px-0" : "w-96 px-5"
          )}
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
      ) : null}
      <main className="flex flex-1 flex-col">
        <header className="sticky top-0 z-40 h-16 bg-background">
          <div className="relative flex h-full items-center gap-3 px-4 sm:gap-4">
            <Button
              variant="outline"
              size="icon"
              className="size-7 md:hidden"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label="Toggle Sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            {secondarySidebar ? (
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                onClick={() => setSecondaryCollapsed((prev) => !prev)}
                aria-label="Toggle Secondary Sidebar"
              >
                <Settings className="h-4 w-4" />
              </Button>
            ) : null}
            <Separator orientation="vertical" className="h-6" />
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
