import { useEffect, useState } from "react";

import type { SafeWorkspaceUser } from "@/components/notebook/types";

export interface UseCurrentUserResult {
  currentUser: SafeWorkspaceUser | null;
  setCurrentUser: (user: SafeWorkspaceUser | null) => void;
  loading: boolean;
  isAdmin: boolean;
}

export const useCurrentUser = (): UseCurrentUserResult => {
  const [currentUser, setCurrentUser] = useState<SafeWorkspaceUser | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchCurrentUser = async () => {
      try {
        const response = await fetch("/auth/me", {
          headers: { Accept: "application/json" },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setCurrentUser(null);
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          data?: SafeWorkspaceUser;
        };
        setCurrentUser(payload?.data ?? null);
      } catch {
        if (!cancelled) {
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    currentUser,
    setCurrentUser,
    loading,
    isAdmin: currentUser?.role === "admin",
  };
};
