"use client";

import { useQuery, useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
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

type PatchableTicket = Pick<
  Doc<"tickets">,
  "_id" | "status" | "ownerId" | "ownerType" | "ownerDisplayName"
>;

interface AssigneePickerProps {
  workspaceId: Id<"workspaces">;
  ticketId: Id<"tickets">;
  currentOwnerId?: string;
  currentOwnerType?: "user" | "agent";
  currentOwnerDisplayName?: string;
}

function patchTicketInQueries(
  localStore: OptimisticLocalStore,
  workspaceId: Id<"workspaces">,
  ticketId: Id<"tickets">,
  patch: <T extends PatchableTicket>(ticket: T) => T
) {
  const tickets = localStore.getQuery(api.tickets.list, { workspaceId });
  if (tickets) {
    localStore.setQuery(
      api.tickets.list,
      { workspaceId },
      tickets.map((ticket) => (ticket._id === ticketId ? patch(ticket) : ticket))
    );
  }

  const ticketSummaries = localStore.getQuery(api.tickets.listSummaries, { workspaceId });
  if (ticketSummaries) {
    localStore.setQuery(
      api.tickets.listSummaries,
      { workspaceId },
      ticketSummaries.map((ticket) =>
        ticket._id === ticketId ? patch(ticket) : ticket
      )
    );
  }

  const hierarchy = localStore.getQuery(api.tickets.getHierarchy, { id: ticketId });
  if (hierarchy) {
    localStore.setQuery(api.tickets.getHierarchy, { id: ticketId }, {
      ...hierarchy,
      ticket: patch(hierarchy.ticket),
    });
  }
}

export function AssigneePicker({
  workspaceId,
  ticketId,
  currentOwnerId,
  currentOwnerType,
  currentOwnerDisplayName,
}: AssigneePickerProps) {
  const members = useQuery(api.workspaceMembers.listByWorkspace, { workspaceId });
  const memberUserIds = useMemo(() => members?.map((m) => m.betterAuthUserId) ?? [], [members]);
  const userProfiles = useQuery(
    api.userProfiles.getByAuthIds,
    memberUserIds.length > 0 ? { betterAuthUserIds: memberUserIds } : "skip"
  );
  const profileMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof userProfiles>[number]>();
    userProfiles?.forEach((p) => map.set(p.betterAuthUserId, p));
    return map;
  }, [userProfiles]);

  const assignTicket = useMutation(api.tickets.assign).withOptimisticUpdate((localStore, args) => {
    patchTicketInQueries(localStore, workspaceId, args.id, (ticket) => ({
      ...ticket,
      ownerId: args.ownerId,
      ownerType: args.ownerType,
      ownerDisplayName: args.ownerDisplayName,
      status: ticket.status === "unclaimed" ? "in_progress" : ticket.status,
    }));
  });

  const unassignTicket = useMutation(api.tickets.unassign).withOptimisticUpdate((localStore, args) => {
    patchTicketInQueries(localStore, workspaceId, args.id, (ticket) => ({
      ...ticket,
      ownerId: undefined,
      ownerType: undefined,
      ownerDisplayName: undefined,
      status: ticket.status === "in_progress" ? "unclaimed" : ticket.status,
    }));
  });

  const syncProfiles = useMutation(api.userProfiles.syncFromAuthIds);
  const requestedProfileIds = useRef(new Set<string>());
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [optimisticOwner, setOptimisticOwner] = useState<{
    ownerId?: string;
    ownerType?: "user" | "agent";
    ownerDisplayName?: string;
  } | null>(null);

  useEffect(() => {
    if (!members || !members.length) return;
    const missing = members
      .map((member) => member.betterAuthUserId)
      .filter((id) => !profileMap.has(id) && !requestedProfileIds.current.has(id));

    if (missing.length === 0) return;

    missing.forEach((id) => requestedProfileIds.current.add(id));
    syncProfiles({ betterAuthUserIds: missing }).catch(console.error);
  }, [members, profileMap, syncProfiles]);

  // Clear optimistic owner once server state catches up (render-time sync)
  if (optimisticOwner) {
    const reachedServerState =
      currentOwnerId === optimisticOwner.ownerId &&
      currentOwnerType === optimisticOwner.ownerType &&
      (currentOwnerDisplayName ?? undefined) === optimisticOwner.ownerDisplayName;

    if (reachedServerState) {
      setOptimisticOwner(null);
    }
  }

  const handleAssign = async (memberId: string) => {
    setMutationError(null);
    const profile = profileMap.get(memberId);
    const displayName = profile?.name || profile?.email || memberId;

    setOptimisticOwner({
      ownerId: memberId,
      ownerType: "user",
      ownerDisplayName: displayName,
    });

    try {
      await assignTicket({
        id: ticketId,
        ownerId: memberId,
        ownerType: "user",
        ownerDisplayName: displayName,
      });
    } catch (error) {
      console.error("Failed to assign ticket:", error);
      setOptimisticOwner(null);
      setMutationError("Could not assign issue");
    }
  };

  const handleUnassign = async () => {
    setMutationError(null);
    setOptimisticOwner({ ownerId: undefined, ownerType: undefined, ownerDisplayName: undefined });
    try {
      await unassignTicket({ id: ticketId });
    } catch (error) {
      console.error("Failed to unassign ticket:", error);
      setOptimisticOwner(null);
      setMutationError("Could not unassign issue");
    }
  };

  const resolvedOwnerId = optimisticOwner?.ownerId ?? currentOwnerId;
  const resolvedOwnerType = optimisticOwner?.ownerType ?? currentOwnerType;
  const resolvedOwnerName = optimisticOwner?.ownerDisplayName ?? currentOwnerDisplayName;

  const displayLabel = resolvedOwnerId ? resolvedOwnerName || resolvedOwnerId : "Unassigned";

  return (
    <div className="space-y-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-10 w-full justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              {resolvedOwnerId ? (
                <>
                  {resolvedOwnerType === "agent" ? (
                    <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                  ) : (
                    <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em]">{displayLabel}</span>
                </>
              ) : (
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Unassigned
                </span>
              )}
            </div>
            <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onClick={handleUnassign} className="gap-2" disabled={!resolvedOwnerId}>
            <UserX className="h-4 w-4" />
            Unassign
          </DropdownMenuItem>
          {members && members.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {members.map((member) => {
                const profile = profileMap.get(member.betterAuthUserId);
                const displayName = profile?.name || profile?.email || member.betterAuthUserId;
                const initials = (profile?.name?.[0] || profile?.email?.[0] || "?").toUpperCase();
                const isSelected = resolvedOwnerId === member.betterAuthUserId;

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
                    <div className="min-w-0 flex flex-col">
                      <span className="truncate text-sm">{displayName}</span>
                      {profile?.name && profile?.email && (
                        <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
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
