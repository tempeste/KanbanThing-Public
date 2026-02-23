"use client";

import { Doc } from "@/convex/_generated/dataModel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Crown, Plus, Shield, Trash2, User, Users } from "lucide-react";

type MemberRole = "owner" | "admin" | "member";

type AddMemberResult = {
  added: string[];
  alreadyMember: string[];
  notFound: string[];
};

type WorkspaceMembersCardProps = {
  members?: Doc<"workspaceMembers">[];
  profileMap: Map<string, Doc<"userProfiles">>;
  currentMembershipRole?: MemberRole | null;
  currentUserId?: string;
  memberEmails: string;
  isAddingMembers: boolean;
  addMemberResult: AddMemberResult | null;
  onMemberEmailsChange: (value: string) => void;
  onAddMembers: () => void | Promise<void>;
  onChangeRole: (memberUserId: string, role: MemberRole) => void | Promise<void>;
  onRemoveMember: (memberUserId: string) => void | Promise<void>;
};

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return <Crown className="h-4 w-4 text-amber-500" />;
    case "admin":
      return <Shield className="h-4 w-4 text-blue-500" />;
    default:
      return <User className="h-4 w-4 text-muted-foreground" />;
  }
}

export function WorkspaceMembersCard({
  members,
  profileMap,
  currentMembershipRole,
  currentUserId,
  memberEmails,
  isAddingMembers,
  addMemberResult,
  onMemberEmailsChange,
  onAddMembers,
  onChangeRole,
  onRemoveMember,
}: WorkspaceMembersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Members
        </CardTitle>
        <CardDescription>
          Manage who has access to this workspace. Owners have full control, admins can manage
          members, and members can view and edit tickets.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="member-emails">Add members by email</Label>
          <Textarea
            id="member-emails"
            placeholder="Enter email addresses (comma or newline separated)"
            value={memberEmails}
            onChange={(event) => onMemberEmailsChange(event.target.value)}
            rows={3}
            className="font-mono text-sm"
          />
          <Button onClick={onAddMembers} disabled={!memberEmails.trim() || isAddingMembers}>
            <Plus className="mr-2 h-4 w-4" />
            {isAddingMembers ? "Adding..." : "Add Members"}
          </Button>
        </div>

        {addMemberResult && (
          <div className="space-y-2 text-sm">
            {addMemberResult.added.length > 0 && (
              <div className="rounded-md border border-green-500/20 bg-green-500/10 p-2 text-green-700 dark:text-green-400">
                <strong>Added:</strong> {addMemberResult.added.join(", ")}
              </div>
            )}
            {addMemberResult.alreadyMember.length > 0 && (
              <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-2 text-yellow-700 dark:text-yellow-400">
                <strong>Already members:</strong> {addMemberResult.alreadyMember.join(", ")}
              </div>
            )}
            {addMemberResult.notFound.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-red-700 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Not found:</strong> {addMemberResult.notFound.join(", ")}
                  <p className="mt-1 text-xs opacity-80">
                    Users must log in at least once before they can be added.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {members && members.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label>Current Members</Label>
              {members.map((member) => {
                const profile = profileMap.get(member.betterAuthUserId);
                const displayName = profile?.name || profile?.email || member.betterAuthUserId;
                const initials = (profile?.name?.[0] || profile?.email?.[0] || "?").toUpperCase();
                const canEditRole =
                  currentMembershipRole === "owner" && member.betterAuthUserId !== currentUserId;
                const canRemove = member.betterAuthUserId !== currentUserId;

                return (
                  <div
                    key={member._id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.image} alt={displayName} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <div>
                          <p className="text-sm font-medium">{displayName}</p>
                          {profile?.name && profile?.email && (
                            <p className="text-xs text-muted-foreground">{profile.email}</p>
                          )}
                          <p className="text-xs capitalize text-muted-foreground">{member.role}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditRole && (
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                          value={member.role}
                          onChange={(event) =>
                            onChangeRole(member.betterAuthUserId, event.target.value as MemberRole)
                          }
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          <option value="owner">Owner</option>
                        </select>
                      )}
                      {canRemove && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveMember(member.betterAuthUserId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
