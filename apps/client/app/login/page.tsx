import Image from "next/image";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import LoginForm from "./login-form";

interface LoginPageProps {
  searchParams?: Promise<{
    from?: string | string[];
  }>;
}

const DEFAULT_REDIRECT: Route = "/";

const resolveRedirect = (raw: string | string[] | undefined): Route => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const input = typeof value === "string" ? value : undefined;
  if (!input) {
    return DEFAULT_REDIRECT;
  }
  try {
    const decoded = decodeURIComponent(input);
    if (!decoded.startsWith("/")) {
      return DEFAULT_REDIRECT;
    }
    if (decoded.startsWith("//")) {
      return DEFAULT_REDIRECT;
    }
    return decoded as Route;
  } catch {
    return DEFAULT_REDIRECT;
  }
};

const fetchSignupStatus = async () => {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) {
    return { canBootstrap: false };
  }
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  try {
    const response = await fetch(`${origin}/auth/signup/status`, {
      cache: "no-store",
      headers: { cookie: headerList.get("cookie") ?? "" },
    });
    if (!response.ok) {
      return { canBootstrap: false };
    }
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { canBootstrap?: boolean };
    };
    return { canBootstrap: Boolean(payload?.data?.canBootstrap) };
  } catch {
    return { canBootstrap: false };
  }
};

const LoginPage = async ({ searchParams }: LoginPageProps) => {
  const params = (await searchParams) ?? {};
  const nextPath = resolveRedirect(params.from);
  const { canBootstrap } = await fetchSignupStatus();

  if (canBootstrap) {
    redirect("/signup");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Image
              src="/icon.svg"
              alt="NodeBooks logo"
              width={40}
              height={40}
              priority
            />
            <span className="text-2xl font-semibold">NodeBooks</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Sign in with your workspace email and password.
          </p>
        </header>
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <LoginForm redirectTo={nextPath} />
        </section>
      </div>
    </main>
  );
};

export default LoginPage;
