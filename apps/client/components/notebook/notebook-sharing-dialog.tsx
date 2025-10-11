import type { FormEvent } from "react";

import { AlertCallout } from "@nodebooks/notebook-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  InvitationSummary,
  NotebookCollaboratorSummary,
  NotebookRole,
} from "@/components/notebook/types";
import type { ThemeMode } from "@/components/theme-context";
import { Ban, Check, Copy, Loader2, UserMinus, UserPlus } from "lucide-react";

export interface NotebookSharingDialogProps {
  open: boolean;
  isAdmin: boolean;
  themeMode: ThemeMode;
  invitationEmail: string;
  invitationRole: NotebookRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  sortedInvitations: InvitationSummary[];
  sortedCollaborators: NotebookCollaboratorSummary[];
  currentUserId?: string;
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  updatingCollaboratorId: string | null;
  removingCollaboratorId: string | null;
  onOpenChange(open: boolean): void;
  onInvitationEmailChange(value: string): void;
  onInvitationRoleChange(value: NotebookRole): void;
  onInviteSubmit(event: FormEvent<HTMLFormElement>): void;
  onCopyInviteLink(): void;
  onRevokeInvitation(id: string): void;
  onUpdateCollaboratorRole(userId: string, role: NotebookRole): void;
  onRemoveCollaborator(userId: string): void;
}

const NotebookSharingDialog = ({
  open,
  isAdmin,
  themeMode,
  invitationEmail,
  invitationRole,
  invitationError,
  shareFetchError,
  shareSubmitting,
  invitesLoading,
  sortedInvitations,
  sortedCollaborators,
  currentUserId,
  newInviteLink,
  copySuccess,
  revokingInvitationId,
  updatingCollaboratorId,
  removingCollaboratorId,
  onOpenChange,
  onInvitationEmailChange,
  onInvitationRoleChange,
  onInviteSubmit,
  onCopyInviteLink,
  onRevokeInvitation,
  onUpdateCollaboratorRole,
  onRemoveCollaborator,
}: NotebookSharingDialogProps) => {
  const effectiveOpen = open && isAdmin;
  const now = Date.now();
  const pendingInvitations = sortedInvitations.filter((invitation) => {
    if (invitation.acceptedAt || invitation.revokedAt) {
      return false;
    }
    const expiresAt = Date.parse(invitation.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= now) {
      return false;
    }
    return true;
  });

  return (
    <Dialog open={effectiveOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl space-y-6">
        <DialogHeader>
          <DialogTitle>Invite collaborators</DialogTitle>
          <DialogDescription>
            Share this notebook with editors or viewers. Invitees create their
            own password before accessing the notebook.
          </DialogDescription>
        </DialogHeader>
        {shareFetchError ? (
          <AlertCallout
            level="error"
            title="Unable to load sharing data"
            text={shareFetchError}
            className="text-sm"
            themeMode={themeMode}
          />
        ) : null}
        <form onSubmit={onInviteSubmit} className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="invitation-email"
                className="text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <input
                id="invitation-email"
                type="email"
                required
                value={invitationEmail}
                onChange={(event) =>
                  onInvitationEmailChange(event.target.value)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="person@example.com"
                disabled={shareSubmitting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="invitation-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="invitation-role"
                value={invitationRole}
                onChange={(event) =>
                  onInvitationRoleChange(event.target.value as NotebookRole)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={shareSubmitting}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Editors can edit the notebook. Viewers have read-only access.
              </p>
            </div>
          </div>
          {invitationError ? (
            <p className="text-sm text-destructive" role="alert">
              {invitationError}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button type="submit" disabled={shareSubmitting}>
              {shareSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Send invite
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
        {newInviteLink ? (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">
              Share this signup link:
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={newInviteLink}
                readOnly
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant={copySuccess ? "secondary" : "outline"}
                onClick={onCopyInviteLink}
                className="shrink-0"
              >
                {copySuccess ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Copy link
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                Invitations
              </h4>
              <Badge variant="outline">{pendingInvitations.length}</Badge>
            </div>
            {invitesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                invitations…
              </div>
            ) : pendingInvitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              <ul className="space-y-2">
                {pendingInvitations.map((invitation) => {
                  const expiresAt = Date.parse(invitation.expiresAt);
                  const expired =
                    !invitation.acceptedAt &&
                    !invitation.revokedAt &&
                    Number.isFinite(expiresAt) &&
                    expiresAt <= now;
                  const status = invitation.acceptedAt
                    ? "Accepted"
                    : invitation.revokedAt
                      ? "Revoked"
                      : expired
                        ? "Expired"
                        : "Pending";
                  const statusColor = invitation.acceptedAt
                    ? "text-emerald-600"
                    : invitation.revokedAt || expired
                      ? "text-rose-500"
                      : "text-amber-600";

                  return (
                    <li
                      key={invitation.id}
                      className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {invitation.email}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {invitation.role}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Invited{" "}
                          {new Date(invitation.createdAt).toLocaleString()}
                          {invitation.invitedByUser
                            ? ` · by ${invitation.invitedByUser.name ?? invitation.invitedByUser.email}`
                            : ""}
                        </p>
                        <p className={`text-xs ${statusColor}`}>
                          Status: {status}
                        </p>
                        {!invitation.acceptedAt && !invitation.revokedAt ? (
                          <p className="text-xs text-muted-foreground">
                            Expires{" "}
                            {new Date(invitation.expiresAt).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      {!invitation.acceptedAt && !invitation.revokedAt ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onRevokeInvitation(invitation.id)}
                          disabled={revokingInvitationId === invitation.id}
                        >
                          {revokingInvitationId === invitation.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Ban className="mr-2 h-4 w-4" />
                          )}
                          Revoke
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                Notebook collaborators
              </h4>
              <Badge variant="outline">{sortedCollaborators.length}</Badge>
            </div>
            {sortedCollaborators.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No one else has access yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedCollaborators.map((collaborator) => {
                  const isSelf = collaborator.user.id === currentUserId;
                  const isUpdating =
                    updatingCollaboratorId === collaborator.userId;
                  const isRemoving =
                    removingCollaboratorId === collaborator.userId;
                  return (
                    <li
                      key={collaborator.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {collaborator.user.name ?? collaborator.user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {collaborator.user.email}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <select
                            value={collaborator.role}
                            onChange={(event) =>
                              onUpdateCollaboratorRole(
                                collaborator.userId,
                                event.target.value as NotebookRole
                              )
                            }
                            disabled={isUpdating || isRemoving}
                            className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          {isSelf ? (
                            <Badge variant="secondary">You</Badge>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                onRemoveCollaborator(collaborator.userId)
                              }
                              disabled={isRemoving}
                            >
                              {isRemoving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserMinus className="mr-2 h-4 w-4" />
                              )}
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotebookSharingDialog;
