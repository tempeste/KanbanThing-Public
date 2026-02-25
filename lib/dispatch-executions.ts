import { Doc, Id } from "@/convex/_generated/dataModel";

export type DispatchExecution = Doc<"dispatchExecutions">;
const ACK_TIMEOUT_MS = 30_000;

export const getLatestDispatchExecutionByTicketId = (
  executions: DispatchExecution[] | undefined
) => {
  const byTicket = new Map<Id<"tickets">, DispatchExecution>();
  if (!executions) return byTicket;

  for (const execution of executions) {
    for (const ticketId of execution.ticketIds) {
      const prev = byTicket.get(ticketId);
      if (!prev || execution.updatedAt > prev.updatedAt) {
        byTicket.set(ticketId, execution);
      }
    }
  }

  return byTicket;
};

export const getDispatchExecutionBadgeLabel = (
  execution: Pick<DispatchExecution, "state"> | null | undefined
) => {
  if (!execution) return null;
  switch (execution.state) {
    case "cancel_requested":
      return "Cancel Requested";
    case "acked":
      return "Acked";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancel_acknowledged":
      return "Cancel Ack";
    case "cancelled":
      return "Cancelled";
    case "too_late_to_cancel":
      return "Too Late";
    case "timed_out":
      return "Timed Out";
    default:
      return execution.state;
  }
};

export const getDispatchExecutionBadgeLabelForTicket = (
  ticket: Pick<Doc<"tickets">, "status" | "lastDispatchAt">,
  execution: Pick<DispatchExecution, "state"> | null | undefined,
  now = Date.now()
) => {
  const direct = getDispatchExecutionBadgeLabel(execution);
  if (direct) return direct;
  if (ticket.status !== "dispatched") return null;
  if (!ticket.lastDispatchAt) return "Awaiting ACK";
  return now - ticket.lastDispatchAt >= ACK_TIMEOUT_MS ? "ACK Timed Out" : "Awaiting ACK";
};
