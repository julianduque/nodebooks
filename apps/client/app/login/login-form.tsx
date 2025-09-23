"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

interface LoginFormProps {
  redirectTo: Route;
}

const LoginForm = ({ redirectTo }: LoginFormProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

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
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Incorrect password");
        return;
      }

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
    </form>
  );
};

export default LoginForm;
