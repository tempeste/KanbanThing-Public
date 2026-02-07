"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bot, User, UserX, ChevronDown } from "lucide-react";

interface AssigneePickerProps {
  workspaceId: Id<"workspaces">;
  ticketId: Id<"tickets">;
  currentOwnerId?: string;
  currentOwnerType?: "user" | "agent";
  currentOwnerDisplayName?: string;
}

export function AssigneePicker({
  workspaceId,
  ticketId,
  currentOwnerId,
  currentOwnerType,
  currentOwnerDisplayName,
}: AssigneePickerProps) {
  const members = useQuery(api.workspaceMembers.listByWorkspace, { workspaceId });
  const memberUserIds = useMemo(
    () => members?.map((m) => m.betterAuthUserId) ?? [],
    [members]
  );
  const userProfiles = useQuery(
    api.userProfiles.getByAuthIds,
    memberUserIds.length > 0 ? { betterAuthUserIds: memberUserIds } : "skip"
  );
  const profileMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof userProfiles>[number]>();
    userProfiles?.forEach((p) => map.set(p.betterAuthUserId, p));
    return map;
  }, [userProfiles]);

  const assignTicket = useMutation(api.tickets.assign);
  const unassignTicket = useMutation(api.tickets.unassign);
  const syncProfiles = useMutation(api.userProfiles.syncFromAuthIds);
  const requestedProfileIds = useRef(new Set<string>());
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!members || !members.length) return;
    const missing = members
      .map((member) => member.betterAuthUserId)
      .filter((id) => !profileMap.has(id) && !requestedProfileIds.current.has(id));

    if (missing.length === 0) return;

    missing.forEach((id) => requestedProfileIds.current.add(id));
    syncProfiles({ betterAuthUserIds: missing }).catch(console.error);
  }, [members, profileMap, syncProfiles]);

  const handleAssign = async (memberId: string) => {
    setMutationError(null);
    const profile = profileMap.get(memberId);
    const displayName = profile?.name || profile?.email || memberId;
    try {
      await assignTicket({
        id: ticketId,
        ownerId: memberId,
        ownerType: "user",
        ownerDisplayName: displayName,
      });
    } catch (error) {
      console.error("Failed to assign ticket:", error);
      setMutationError("Could not assign issue");
    }
  };

  const handleUnassign = async () => {
    setMutationError(null);
    try {
      await unassignTicket({ id: ticketId });
    } catch (error) {
      console.error("Failed to unassign ticket:", error);
      setMutationError("Could not unassign issue");
    }
  };

  const displayLabel = currentOwnerId
    ? currentOwnerDisplayName || currentOwnerId
    : "Unassigned";

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2 h-auto py-1.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              {currentOwnerId ? (
                <>
                  {currentOwnerType === "agent" ? (
                    <Bot className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm">{displayLabel}</span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Unassigned</span>
              )}
            </div>
            <ChevronDown className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={handleUnassign}
            className="gap-2"
            disabled={!currentOwnerId}
          >
            <UserX className="w-4 h-4" />
            Unassign
          </DropdownMenuItem>
          {members && members.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {members.map((member) => {
                const profile = profileMap.get(member.betterAuthUserId);
                const displayName = profile?.name || profile?.email || member.betterAuthUserId;
                const initials = (profile?.name?.[0] || profile?.email?.[0] || "?").toUpperCase();
                const isSelected = currentOwnerId === member.betterAuthUserId;

                return (
                  <DropdownMenuItem
                    key={member._id}
                    onClick={() => handleAssign(member.betterAuthUserId)}
                    className="gap-2"
                    disabled={isSelected}
                  >
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={profile?.image} alt={displayName} />
                      <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">{displayName}</span>
                      {profile?.name && profile?.email && (
                        <span className="truncate text-xs text-muted-foreground">
                          {profile.email}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {mutationError && (
        <p className="text-xs text-destructive" role="alert">
          {mutationError}
        </p>
      )}
    </div>
  );
}
