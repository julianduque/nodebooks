"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface SignupFormProps {
  initialToken?: string;
}

type WorkspaceRole = "admin" | "editor" | "viewer";

interface InvitationPreview {
  email: string;
  role: WorkspaceRole;
  invitedBy?: string | null;
  expiresAt: string;
}

const SignupForm = ({ initialToken = "" }: SignupFormProps) => {
  const [token, setToken] = useState(initialToken);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setInvitation(null);
      setInspectError(null);
      setInspectLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const fetchInvitation = async () => {
      setInspectLoading(true);
      setInspectError(null);
      try {
        const response = await fetch("/auth/invitations/inspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: trimmed }),
          signal: controller.signal,
        });
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setInvitation(null);
          setInspectError(payload?.error ?? "Invitation not found");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          data?: {
            email?: string;
            role?: WorkspaceRole;
            invitedByUser?: {
              name?: string | null;
              email?: string | null;
            } | null;
            expiresAt?: string;
          };
        };
        const data = payload?.data;
        if (!data?.email || !data?.role) {
          setInvitation(null);
          setInspectError("Invitation not found");
          return;
        }
        setInvitation({
          email: data.email,
          role: data.role,
          invitedBy:
            data.invitedByUser?.name ?? data.invitedByUser?.email ?? null,
          expiresAt: data.expiresAt ?? "",
        });
        setInspectError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setInvitation(null);
        setInspectError("Unable to verify invitation");
      } finally {
        if (!cancelled) {
          setInspectLoading(false);
        }
      }
    };

    void fetchInvitation();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invitation) {
      setSubmitError("Enter a valid invitation token before continuing.");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match.");
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setSubmitError(payload?.error ?? "Unable to complete signup.");
        setSubmitting(false);
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setName("");
      router.replace("/");
      router.refresh();
    } catch {
      setSubmitError("Unable to complete signup. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="token" className="text-sm font-medium">
          Invitation token
        </label>
        <input
          id="token"
          name="token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Paste the invitation token"
          required
          disabled={submitting}
        />
        {inspectLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifying invitation…
          </div>
        ) : null}
        {inspectError ? (
          <p className="text-sm text-destructive" role="alert">
            {inspectError}
          </p>
        ) : null}
      </div>
      {invitation ? (
        <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            Inviting <span className="font-semibold">{invitation.email}</span>{" "}
            as
            <span className="font-semibold"> {invitation.role}</span>
          </p>
          {invitation.invitedBy ? (
            <p className="text-xs text-muted-foreground">
              Invited by {invitation.invitedBy}
            </p>
          ) : null}
          {invitation.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              Expires {new Date(invitation.expiresAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Name (optional)
        </label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="How should teammates refer to you?"
          disabled={submitting}
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
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Create a password"
          required
          minLength={8}
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">
          Password must be at least 8 characters long.
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Re-enter your password"
          required
          minLength={8}
          disabled={submitting}
        />
      </div>
      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      <button
        type="submit"
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow disabled:cursor-not-allowed disabled:opacity-70"
        disabled={submitting || !invitation || inspectLoading}
      >
        {submitting ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
};

export default SignupForm;
