"use client";

import {
  createContext,
  type PropsWithChildren,
  useContext,
} from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { TicketSummary } from "@/lib/ticket-summary";
import { useSession } from "@/lib/auth-client";

type WorkspaceDataContextValue = {
  workspace: Doc<"workspaces"> | null | undefined;
  tags: Doc<"workspaceTags">[] | undefined;
  ticketSummaries: TicketSummary[] | undefined;
  dispatchExecutions: Doc<"dispatchExecutions">[] | undefined;
};

const WorkspaceDataContext = createContext<WorkspaceDataContextValue | null>(null);

export function WorkspaceDataProvider({
  children,
  workspaceId,
}: PropsWithChildren<{ workspaceId: Id<"workspaces"> }>) {
  const { isAuthenticated } = useConvexAuth();
  const { data: session, isPending: isSessionPending } = useSession();
  const canQueryWorkspace = isAuthenticated && !isSessionPending && Boolean(session?.user);

  const workspace = useQuery(
    api.workspaces.get,
    canQueryWorkspace ? { id: workspaceId } : "skip"
  );
  const hasWorkspaceAccess = workspace !== undefined && workspace !== null;
  const tags = useQuery(api.tags.list, hasWorkspaceAccess ? { workspaceId } : "skip");
  const ticketSummaries = useQuery(
    api.tickets.listSummaries,
    hasWorkspaceAccess ? { workspaceId } : "skip"
  );
  const dispatchExecutions = useQuery(
    api.dispatchExecutions.listByWorkspace,
    hasWorkspaceAccess ? { workspaceId, limit: 200 } : "skip"
  );

  return (
    <WorkspaceDataContext.Provider
      value={{ workspace, tags, ticketSummaries, dispatchExecutions }}
    >
      {children}
    </WorkspaceDataContext.Provider>
  );
}

export function useWorkspaceData() {
  const context = useContext(WorkspaceDataContext);
  if (!context) {
    throw new Error("useWorkspaceData must be used within a WorkspaceDataProvider");
  }
  return context;
}
