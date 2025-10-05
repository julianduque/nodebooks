import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  ProjectCollaboratorSummary,
  ProjectInvitationSummary,
  ProjectRole,
} from "@/components/notebook/types";

export interface UseProjectSharingOptions {
  isAdmin: boolean;
  projectId?: string;
}

export interface UseProjectSharingResult {
  sharingOpen: boolean;
  invitationEmail: string;
  invitationRole: ProjectRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  collaborators: ProjectCollaboratorSummary[];
  invitations: ProjectInvitationSummary[];
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  updatingCollaboratorId: string | null;
  removingCollaboratorId: string | null;
  sortedCollaborators: ProjectCollaboratorSummary[];
  sortedInvitations: ProjectInvitationSummary[];
  refreshSharingData(): Promise<void>;
  handleOpenSharing(): void;
  handleInviteSubmit(event: FormEvent<HTMLFormElement>): Promise<void>;
  handleSharingOpenChange(open: boolean): void;
  handleCopyInviteLink(): Promise<void>;
  handleRevokeInvitation(invitationId: string): Promise<void>;
  handleUpdateCollaboratorRole(
    userId: string,
    role: ProjectRole
  ): Promise<void>;
  handleRemoveCollaborator(userId: string): Promise<void>;
  setInvitationEmail(value: string): void;
  setInvitationRole(role: ProjectRole): void;
}

const roleOrder: Record<ProjectRole, number> = {
  editor: 0,
  viewer: 1,
};

export const useProjectSharing = ({
  isAdmin,
  projectId,
}: UseProjectSharingOptions): UseProjectSharingResult => {
  const [sharingOpen, setSharingOpen] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationRole, setInvitationRole] = useState<ProjectRole>("editor");
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [shareFetchError, setShareFetchError] = useState<string | null>(null);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<
    ProjectCollaboratorSummary[]
  >([]);
  const [invitations, setInvitations] = useState<ProjectInvitationSummary[]>(
    []
  );
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
    if (!isAdmin || !projectId) {
      return;
    }
    setInvitesLoading(true);
    setShareFetchError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/sharing`,
        { headers: { Accept: "application/json" } }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        data?: {
          collaborators?: ProjectCollaboratorSummary[];
          invitations?: ProjectInvitationSummary[];
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
          ? payload.data!.invitations.filter((item) => !item.acceptedAt)
          : []
      );
    } catch (error) {
      setShareFetchError(
        error instanceof Error ? error.message : "Unable to load sharing data"
      );
    } finally {
      setInvitesLoading(false);
    }
  }, [isAdmin, projectId]);

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
    if (!isAdmin || !projectId) {
      return;
    }
    setSharingOpen(true);
    resetFormState();
    void refreshSharingData();
  }, [isAdmin, projectId, refreshSharingData, resetFormState]);

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
      if (!isAdmin || shareSubmitting || !projectId) {
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
          `/api/projects/${encodeURIComponent(projectId)}/sharing/invitations`,
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
                invitation: ProjectInvitationSummary;
                token?: string;
              }
            | {
                type: "collaborator";
                collaborator: ProjectCollaboratorSummary;
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
        void refreshSharingData();
      } catch (error) {
        setInvitationError(
          error instanceof Error ? error.message : "Failed to send invitation"
        );
      } finally {
        setShareSubmitting(false);
      }
    },
    [
      invitationEmail,
      invitationRole,
      isAdmin,
      projectId,
      refreshSharingData,
      shareSubmitting,
    ]
  );

  const handleCopyInviteLink = useCallback(async () => {
    if (!newInviteLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(newInviteLink);
      setCopySuccess(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      setCopySuccess(false);
      setInvitationError(
        error instanceof Error ? error.message : "Failed to copy link"
      );
    }
  }, [newInviteLink]);

  const handleRevokeInvitation = useCallback(
    async (invitationId: string) => {
      if (!isAdmin || !projectId) {
        return;
      }
      setRevokingInvitationId(invitationId);
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/sharing/invitations/${encodeURIComponent(invitationId)}/revoke`,
          { method: "POST" }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload?.error ?? "Failed to revoke invitation");
        }
        void refreshSharingData();
      } catch (error) {
        setShareFetchError(
          error instanceof Error ? error.message : "Failed to revoke invitation"
        );
      } finally {
        setRevokingInvitationId(null);
      }
    },
    [isAdmin, projectId, refreshSharingData]
  );

  const handleUpdateCollaboratorRole = useCallback(
    async (userId: string, role: ProjectRole) => {
      if (!isAdmin || !projectId) {
        return;
      }
      setUpdatingCollaboratorId(userId);
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/sharing/collaborators/${encodeURIComponent(userId)}`,
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
          throw new Error(payload?.error ?? "Failed to update collaborator");
        }
        void refreshSharingData();
      } catch (error) {
        setShareFetchError(
          error instanceof Error
            ? error.message
            : "Failed to update collaborator"
        );
      } finally {
        setUpdatingCollaboratorId(null);
      }
    },
    [isAdmin, projectId, refreshSharingData]
  );

  const handleRemoveCollaborator = useCallback(
    async (userId: string) => {
      if (!isAdmin || !projectId) {
        return;
      }
      setRemovingCollaboratorId(userId);
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/sharing/collaborators/${encodeURIComponent(userId)}`,
          { method: "DELETE" }
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload?.error ?? "Failed to remove collaborator");
        }
        void refreshSharingData();
      } catch (error) {
        setShareFetchError(
          error instanceof Error
            ? error.message
            : "Failed to remove collaborator"
        );
      } finally {
        setRemovingCollaboratorId(null);
      }
    },
    [isAdmin, projectId, refreshSharingData]
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
