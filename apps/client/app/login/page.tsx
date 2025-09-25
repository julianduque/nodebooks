import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { loadServerConfig } from "@nodebooks/config";

import LoginForm from "./login-form";
import {
  PASSWORD_COOKIE_NAME,
  derivePasswordToken,
  isTokenValid,
} from "../../lib/password";

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

const LoginPage = async ({ searchParams }: LoginPageProps) => {
  const configuredPassword = loadServerConfig().password ?? undefined;
  if (!configuredPassword) {
    redirect("/");
  }

  const expectedToken = derivePasswordToken(configuredPassword);
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(PASSWORD_COOKIE_NAME)?.value;

  const params = (await searchParams) ?? {};
  const nextPath = resolveRedirect(params.from);
  if (isTokenValid(cookieToken, expectedToken)) {
    redirect(nextPath);
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
            Enter the password to continue.
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
