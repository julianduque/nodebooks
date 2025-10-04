"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

interface LoginFormProps {
  redirectTo: Route;
}

const LoginForm = ({ redirectTo }: LoginFormProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      try {
        const response = await fetch("/auth/me", {
          headers: { Accept: "application/json" },
        });
        if (!cancelled && response.ok) {
          router.replace(redirectTo);
          router.refresh();
        }
      } catch {
        // ignore session detection failures
      }
    };
    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "Incorrect email or password");
        return;
      }

      setEmail("");
      setPassword("");
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="you@example.com"
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Enter password"
          required
          disabled={isSubmitting}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-xs text-muted-foreground text-center">
        Need access? Ask a workspace admin to send you an invitation.
      </p>
    </form>
  );
};

export default LoginForm;
