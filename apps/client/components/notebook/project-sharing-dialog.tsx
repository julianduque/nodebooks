import type { FormEvent } from "react";

import { AlertCallout } from "@nodebooks/ui";
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
  ProjectCollaboratorSummary,
  ProjectInvitationSummary,
  ProjectRole,
} from "@/components/notebook/types";
import type { ThemeMode } from "@/components/theme-context";
import { Ban, Check, Copy, Loader2, UserMinus, UserPlus } from "lucide-react";

export interface ProjectSharingDialogProps {
  open: boolean;
  isAdmin: boolean;
  themeMode: ThemeMode;
  invitationEmail: string;
  invitationRole: ProjectRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  sortedInvitations: ProjectInvitationSummary[];
  sortedCollaborators: ProjectCollaboratorSummary[];
  currentUserId?: string;
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  updatingCollaboratorId: string | null;
  removingCollaboratorId: string | null;
  onOpenChange(open: boolean): void;
  onInvitationEmailChange(value: string): void;
  onInvitationRoleChange(value: ProjectRole): void;
  onInviteSubmit(event: FormEvent<HTMLFormElement>): void;
  onCopyInviteLink(): void;
  onRevokeInvitation(id: string): void;
  onUpdateCollaboratorRole(userId: string, role: ProjectRole): void;
  onRemoveCollaborator(userId: string): void;
}

const ProjectSharingDialog = ({
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
}: ProjectSharingDialogProps) => {
  const effectiveOpen = open && isAdmin;

  return (
    <Dialog open={effectiveOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl space-y-6">
        <DialogHeader>
          <DialogTitle>Invite collaborators</DialogTitle>
          <DialogDescription>
            Share this project with editors or viewers. Invitees create their
            own password before accessing the project and its notebooks.
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
                htmlFor="project-invitation-email"
                className="text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <input
                id="project-invitation-email"
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
              <label
                htmlFor="project-invitation-role"
                className="text-sm font-medium"
              >
                Role
              </label>
              <select
                id="project-invitation-role"
                value={invitationRole}
                onChange={(event) =>
                  onInvitationRoleChange(event.target.value as ProjectRole)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={shareSubmitting}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Editors can reorganize notebooks in the project. Viewers have
                read-only access.
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
              <Badge variant="outline">{sortedInvitations.length}</Badge>
            </div>
            {invitesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading
                invitations…
              </div>
            ) : sortedInvitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No invitations have been sent yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedInvitations.map((invitation) => {
                  const expiresAt = Date.parse(invitation.expiresAt);
                  const expired =
                    !invitation.acceptedAt &&
                    !invitation.revokedAt &&
                    Number.isFinite(expiresAt) &&
                    expiresAt <= Date.now();
                  const status = invitation.acceptedAt
                    ? "Accepted"
                    : invitation.revokedAt
                      ? "Revoked"
                      : expired
                        ? "Expired"
                        : "Pending";
                  return (
                    <li
                      key={invitation.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-start sm:gap-4"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {invitation.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Role: {invitation.role}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Status: {status}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={Boolean(invitation.revokedAt)}
                        onClick={() => onRevokeInvitation(invitation.id)}
                        className="sm:self-start"
                      >
                        {revokingInvitationId === invitation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Ban className="mr-2 h-4 w-4" /> Revoke
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                Collaborators
              </h4>
              <Badge variant="outline">{sortedCollaborators.length}</Badge>
            </div>
            {sortedCollaborators.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No collaborators yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sortedCollaborators.map((collaborator) => {
                  const isCurrentUser = collaborator.userId === currentUserId;
                  const label =
                    collaborator.user.name ?? collaborator.user.email;
                  return (
                    <li
                      key={collaborator.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-start sm:gap-4"
                    >
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {collaborator.user.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Role: {collaborator.role}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3 sm:self-start">
                        <select
                          value={collaborator.role}
                          onChange={(event) =>
                            onUpdateCollaboratorRole(
                              collaborator.userId,
                              event.target.value as ProjectRole
                            )
                          }
                          disabled={
                            isCurrentUser ||
                            updatingCollaboratorId === collaborator.userId
                          }
                          className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive sm:self-start"
                          disabled={isCurrentUser}
                          onClick={() =>
                            onRemoveCollaborator(collaborator.userId)
                          }
                        >
                          {removingCollaboratorId === collaborator.userId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <UserMinus className="mr-2 h-4 w-4" /> Remove
                            </>
                          )}
                        </Button>
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

export default ProjectSharingDialog;
