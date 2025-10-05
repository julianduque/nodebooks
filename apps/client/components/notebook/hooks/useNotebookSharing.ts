import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  InvitationSummary,
  NotebookCollaboratorSummary,
  NotebookRole,
} from "@/components/notebook/types";

export interface UseNotebookSharingOptions {
  isAdmin: boolean;
  notebookId?: string;
}

export interface UseNotebookSharingResult {
  sharingOpen: boolean;
  invitationEmail: string;
  invitationRole: NotebookRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  collaborators: NotebookCollaboratorSummary[];
  invitations: InvitationSummary[];
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  updatingCollaboratorId: string | null;
  removingCollaboratorId: string | null;
  sortedCollaborators: NotebookCollaboratorSummary[];
  sortedInvitations: InvitationSummary[];
  refreshSharingData(): Promise<void>;
  handleOpenSharing(): void;
  handleInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
  handleSharingOpenChange(open: boolean): void;
  handleCopyInviteLink(): Promise<void>;
  handleRevokeInvitation(invitationId: string): Promise<void>;
  handleUpdateCollaboratorRole(
    userId: string,
    role: NotebookRole
  ): Promise<void>;
  handleRemoveCollaborator(userId: string): Promise<void>;
  setInvitationEmail(value: string): void;
  setInvitationRole(role: NotebookRole): void;
}

const roleOrder: Record<NotebookRole, number> = {
  editor: 0,
  viewer: 1,
};

export const useNotebookSharing = ({
  isAdmin,
  notebookId,
}: UseNotebookSharingOptions): UseNotebookSharingResult => {
  const [sharingOpen, setSharingOpen] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<NotebookRole>("editor");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [shareFetchError, setShareFetchError] = useState<string | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<
    NotebookCollaboratorSummary[]
  >([]);
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [revokingInvitationId, setRevokingInvitationId] = useState<
    string | null
  >(null);
  const [updatingCollaboratorId, setUpdatingCollaboratorId] = useState<
    string | null
  >(null);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<
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
    if (!isAdmin || !notebookId) {
      return;
    }
    setInvitesLoading(true);
    setShareFetchError(null);
    try {
      const response = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/sharing`,
        { headers: { Accept: "application/json" } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          collaborators?: NotebookCollaboratorSummary[];
          invitations?: InvitationSummary[];
        };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load sharing data");
      }
      setCollaborators(
        Array.isArray(payload?.data?.collaborators)
          ? payload.data!.collaborators
          : []
      );
      setInvitations(
        Array.isArray(payload?.data?.invitations)
          ? payload.data!.invitations
          : []
      );
    } catch (error) {
      setShareFetchError(
        error instanceof Error ? error.message : "Unable to load sharing data"
      );
    } finally {
      setInvitesLoading(false);
    }
  }, [isAdmin, notebookId]);

  const sortedCollaborators = useMemo(() => {
    return [...collaborators].sort((a, b) => {
      if (a.role !== b.role) {
        return roleOrder[a.role] - roleOrder[b.role];
      }
      const aLabel = a.user.name ?? a.user.email;
      const bLabel = b.user.name ?? b.user.email;
      return aLabel.localeCompare(bLabel);
    });
  }, [collaborators]);

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
    if (!isAdmin || !notebookId) {
      return;
    }
    setSharingOpen(true);
    resetFormState();
    void refreshSharingData();
  }, [isAdmin, notebookId, refreshSharingData, resetFormState]);

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
      if (!isAdmin || shareSubmitting || !notebookId) {
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
        const response = await fetch(
          `/api/notebooks/${encodeURIComponent(notebookId)}/sharing/invitations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, role: invitationRole }),
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          data?:
            | {
                type: "invitation";
                invitation: InvitationSummary;
                token?: string;
              }
            | {
                type: "collaborator";
                collaborator: NotebookCollaboratorSummary;
              };
          error?: string;
        };
        if (!response.ok || !payload?.data) {
          setInvitationError(payload?.error ?? "Failed to send invitation");
          return;
        }
        setInvitationEmail("");
        if (
          payload.data.type === "invitation" &&
          typeof payload.data.token === "string" &&
          typeof window !== "undefined"
        ) {
          const link = `${window.location.origin}/signup?token=${encodeURIComponent(payload.data.token)}`;
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
      notebookId,
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
      if (!isAdmin || !notebookId) {
        return;
      }
      setShareFetchError(null);
      setRevokingInvitationId(invitationId);
      try {
        const response = await fetch(
          `/api/notebooks/${encodeURIComponent(
            notebookId
          )}/sharing/invitations/${encodeURIComponent(invitationId)}/revoke`,
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
    [isAdmin, notebookId, refreshSharingData]
  );

  const handleUpdateCollaboratorRole = useCallback(
    async (userId: string, role: NotebookRole) => {
      if (!isAdmin || !notebookId) {
        return;
      }
      setShareFetchError(null);
      setUpdatingCollaboratorId(userId);
      try {
        const response = await fetch(
          `/api/notebooks/${encodeURIComponent(
            notebookId
          )}/sharing/collaborators/${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setShareFetchError(
            payload?.error ?? "Failed to update collaborator role"
          );
          return;
        }
        await refreshSharingData();
      } catch {
        setShareFetchError("Failed to update collaborator role");
      } finally {
        setUpdatingCollaboratorId(null);
      }
    },
    [isAdmin, notebookId, refreshSharingData]
  );

  const handleRemoveCollaborator = useCallback(
    async (userId: string) => {
      if (!isAdmin || !notebookId) {
        return;
      }
      setShareFetchError(null);
      setRemovingCollaboratorId(userId);
      try {
        const response = await fetch(
          `/api/notebooks/${encodeURIComponent(
            notebookId
          )}/sharing/collaborators/${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
            headers: { Accept: "application/json" },
          }
        );
        if (!response.ok && response.status !== 204) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          setShareFetchError(payload?.error ?? "Failed to remove collaborator");
          return;
        }
        await refreshSharingData();
      } catch {
        setShareFetchError("Failed to remove collaborator");
      } finally {
        setRemovingCollaboratorId(null);
      }
    },
    [isAdmin, notebookId, refreshSharingData]
  );

  return {
    sharingOpen,
    invitationEmail,
    invitationRole,
    invitationError,
    shareFetchError,
    shareSubmitting,
    invitesLoading,
    collaborators,
    invitations,
    newInviteLink,
    copySuccess,
    revokingInvitationId,
    updatingCollaboratorId,
    removingCollaboratorId,
    sortedCollaborators,
    sortedInvitations,
    refreshSharingData,
    handleOpenSharing,
    handleInviteSubmit,
    handleSharingOpenChange,
    handleCopyInviteLink,
    handleRevokeInvitation,
    handleUpdateCollaboratorRole,
    handleRemoveCollaborator,
    setInvitationEmail,
    setInvitationRole,
  };
};
