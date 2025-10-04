import Image from "next/image";
import type { Route } from "next";

import { headers } from "next/headers";

import SignupForm from "./signup-form";

interface SignupPageProps {
  searchParams?: Promise<{
    token?: string | string[];
    from?: string | string[];
  }>;
}

const DEFAULT_REDIRECT: Route = "/";

const resolveToken = (raw: string | string[] | undefined): string => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : "";
};

const resolveRedirect = (raw: string | string[] | undefined): Route => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return DEFAULT_REDIRECT;
  }
  try {
    const decoded = decodeURIComponent(value);
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
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;
  try {
    const response = await fetch(`${origin}/auth/signup/status`, {
      cache: "no-store",
      headers: {
        cookie: headerList.get("cookie") ?? "",
      },
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

const SignupPage = async ({ searchParams }: SignupPageProps) => {
  const params = (await searchParams) ?? {};
  const initialToken = resolveToken(params.token);
  const redirectTo = resolveRedirect(params.from);
  const { canBootstrap } = await fetchSignupStatus();
  const title = canBootstrap ? "Create your admin account" : "Join NodeBooks";
  const description = canBootstrap
    ? "Set up the first admin for this workspace. You'll invite others later."
    : "Accept your invitation and set a password to access the workspace.";

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-2">
            <Image
              src="/icon.svg"
              alt="NodeBooks logo"
              width={40}
              height={40}
              priority
            />
            <span className="text-2xl font-semibold">{title}</span>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <SignupForm initialToken={initialToken} bootstrap={canBootstrap} />
        </section>
        {canBootstrap ? null : (
          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <a
              className="font-medium text-primary"
              href={`/login?from=${encodeURIComponent(redirectTo)}`}
            >
              Sign in
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
};

export default SignupPage;
