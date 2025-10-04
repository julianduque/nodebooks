import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  InvitationSummary,
  SafeWorkspaceUser,
  WorkspaceRole,
} from "@/components/notebook/types";

export interface UseNotebookSharingOptions {
  isAdmin: boolean;
}

export interface UseNotebookSharingResult {
  sharingOpen: boolean;
  invitationEmail: string;
  invitationRole: WorkspaceRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  members: SafeWorkspaceUser[];
  invitations: InvitationSummary[];
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  sortedMembers: SafeWorkspaceUser[];
  sortedInvitations: InvitationSummary[];
  refreshSharingData(): Promise<void>;
  handleOpenSharing(): void;
  handleInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
  handleSharingOpenChange(open: boolean): void;
  handleCopyInviteLink(): Promise<void>;
  handleRevokeInvitation(invitationId: string): Promise<void>;
  setInvitationEmail(value: string): void;
  setInvitationRole(role: WorkspaceRole): void;
}

export const useNotebookSharing = ({
  isAdmin,
}: UseNotebookSharingOptions): UseNotebookSharingResult => {
  const [sharingOpen, setSharingOpen] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<WorkspaceRole>("editor");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [shareFetchError, setShareFetchError] = useState<string | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [members, setMembers] = useState<SafeWorkspaceUser[]>([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<
    string | null
  >(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  const refreshSharingData = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setInvitesLoading(true);
    setShareFetchError(null);
    try {
      const [usersResponse, invitationsResponse] = await Promise.all([
        fetch("/auth/users", { headers: { Accept: "application/json" } }),
        fetch("/auth/invitations", { headers: { Accept: "application/json" } }),
      ]);

      if (!usersResponse.ok) {
        const payload = (await usersResponse.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload?.error ?? "Failed to load members");
      }
      if (!invitationsResponse.ok) {
        const payload = (await invitationsResponse
          .json()
          .catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload?.error ?? "Failed to load invitations");
      }

      const usersPayload = (await usersResponse.json()) as {
        data?: SafeWorkspaceUser[];
      };
      const invitationsPayload = (await invitationsResponse.json()) as {
        data?: InvitationSummary[];
      };

      setMembers(Array.isArray(usersPayload?.data) ? usersPayload.data : []);
      setInvitations(
        Array.isArray(invitationsPayload?.data) ? invitationsPayload.data : []
      );
    } catch (error) {
      setShareFetchError(
        error instanceof Error ? error.message : "Unable to load sharing data"
      );
    } finally {
      setInvitesLoading(false);
    }
  }, [isAdmin]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role !== b.role) {
        const roleOrder: Record<WorkspaceRole, number> = {
          admin: 0,
          editor: 1,
          viewer: 2,
        };
        return roleOrder[a.role] - roleOrder[b.role];
      }
      return a.email.localeCompare(b.email);
    });
  }, [members]);

  const sortedInvitations = useMemo(() => {
    return [...invitations].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [invitations]);

  const resetFormState = useCallback(() => {
    setInvitationEmail("");
    setInvitationRole("editor");
    setInvitationError(null);
    setShareFetchError(null);
    setNewInviteLink(null);
    setCopySuccess(false);
  }, []);

  const handleOpenSharing = useCallback(() => {
    if (!isAdmin) {
      return;
    }
    setSharingOpen(true);
    resetFormState();
    void refreshSharingData();
  }, [isAdmin, refreshSharingData, resetFormState]);

  const handleSharingOpenChange = useCallback(
    (open: boolean) => {
      setSharingOpen(open);
      if (!open) {
        resetFormState();
      }
    },
    [resetFormState]
  );

  const handleInviteSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isAdmin || shareSubmitting) {
        return;
      }
      const email = invitationEmail.trim();
      if (!email) {
        setInvitationError("Provide an email address");
        return;
      }
      setInvitationError(null);
      setShareFetchError(null);
      setShareSubmitting(true);
      try {
        const response = await fetch("/auth/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role: invitationRole }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          token?: string;
        };
        if (!response.ok) {
          setInvitationError(payload?.error ?? "Failed to send invitation");
          return;
        }
        setInvitationEmail("");
        if (
          typeof payload?.token === "string" &&
          typeof window !== "undefined"
        ) {
          const link = `${window.location.origin}/signup?token=${encodeURIComponent(payload.token)}`;
          setNewInviteLink(link);
          setCopySuccess(false);
        }
        await refreshSharingData();
      } catch {
        setInvitationError("Failed to send invitation");
      } finally {
        setShareSubmitting(false);
      }
    },
    [
      isAdmin,
      shareSubmitting,
      invitationEmail,
      invitationRole,
      refreshSharingData,
    ]
  );

  const handleCopyInviteLink = useCallback(async () => {
    if (!newInviteLink) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(newInviteLink);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        setCopySuccess(true);
        copyTimeoutRef.current = setTimeout(() => {
          setCopySuccess(false);
          copyTimeoutRef.current = null;
        }, 2000);
      }
    } catch {
      setCopySuccess(false);
    }
  }, [newInviteLink]);

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!isAdmin) {
        return;
      }
      setShareFetchError(null);
      setRevokingInvitationId(invitationId);
      try {
        const response = await fetch(
          `/auth/invitations/${encodeURIComponent(invitationId)}/revoke`,
          {
            method: "POST",
            headers: { Accept: "application/json" },
          }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setShareFetchError(payload?.error ?? "Failed to revoke invitation");
          return;
        }
        await refreshSharingData();
      } catch {
        setShareFetchError("Failed to revoke invitation");
      } finally {
        setRevokingInvitationId(null);
      }
    },
    [isAdmin, refreshSharingData]
  );

  return {
    sharingOpen,
    invitationEmail,
    invitationRole,
    invitationError,
    shareFetchError,
    shareSubmitting,
    invitesLoading,
    members,
    invitations,
    newInviteLink,
    copySuccess,
    revokingInvitationId,
    sortedMembers,
    sortedInvitations,
    refreshSharingData,
    handleOpenSharing,
    handleInviteSubmit,
    handleSharingOpenChange,
    handleCopyInviteLink,
    handleRevokeInvitation,
    setInvitationEmail,
    setInvitationRole,
  };
};
