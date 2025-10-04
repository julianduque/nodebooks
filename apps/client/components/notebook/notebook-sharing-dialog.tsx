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
  SafeWorkspaceUser,
  WorkspaceRole,
} from "@/components/notebook/types";
import type { ThemeMode } from "@/components/theme-context";
import { Ban, Check, Copy, Loader2, UserPlus } from "lucide-react";

export interface NotebookSharingDialogProps {
  open: boolean;
  isAdmin: boolean;
  themeMode: ThemeMode;
  invitationEmail: string;
  invitationRole: WorkspaceRole;
  invitationError: string | null;
  shareFetchError: string | null;
  shareSubmitting: boolean;
  invitesLoading: boolean;
  sortedInvitations: InvitationSummary[];
  sortedMembers: SafeWorkspaceUser[];
  currentUserId?: string;
  newInviteLink: string | null;
  copySuccess: boolean;
  revokingInvitationId: string | null;
  onOpenChange(open: boolean): void;
  onInvitationEmailChange(value: string): void;
  onInvitationRoleChange(value: WorkspaceRole): void;
  onInviteSubmit(event: FormEvent<HTMLFormElement>): void;
  onCopyInviteLink(): void;
  onRevokeInvitation(id: string): void;
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
  sortedMembers,
  currentUserId,
  newInviteLink,
  copySuccess,
  revokingInvitationId,
  onOpenChange,
  onInvitationEmailChange,
  onInvitationRoleChange,
  onInviteSubmit,
  onCopyInviteLink,
  onRevokeInvitation,
}: NotebookSharingDialogProps) => {
  const effectiveOpen = open && isAdmin;

  return (
    <Dialog open={effectiveOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl space-y-6">
        <DialogHeader>
          <DialogTitle>Invite collaborators</DialogTitle>
          <DialogDescription>
            Send role-based invitations. Invitees must create their own password
            before accessing the workspace.
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
                  onInvitationRoleChange(event.target.value as WorkspaceRole)
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={shareSubmitting}
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Admins can manage settings and invite others. Editors can modify
                notebooks, while viewers have read-only access.
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
                Workspace members
              </h4>
              <Badge variant="outline">{sortedMembers.length}</Badge>
            </div>
            {sortedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members found.</p>
            ) : (
              <ul className="space-y-2">
                {sortedMembers.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-col gap-1 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {member.name ?? member.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.email} · {member.role}
                      </p>
                    </div>
                    {member.id === currentUserId ? (
                      <Badge variant="secondary">You</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotebookSharingDialog;
