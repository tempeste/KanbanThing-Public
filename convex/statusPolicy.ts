export type TicketStatus = "unclaimed" | "in_progress" | "done";
export type TransitionClass = "standard" | "non_standard";

export const getTransitionClass = (
  from: TicketStatus,
  to: TicketStatus
): TransitionClass => {
  if (from === to) {
    return "standard";
  }
  if (
    (from === "unclaimed" && to === "in_progress") ||
    (from === "in_progress" && to === "done")
  ) {
    return "standard";
  }
  return "non_standard";
};

export const normalizeStatusReason = (reason: string | undefined) => {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : undefined;
};

export const validateStatusTransitionForActor = ({
  from,
  to,
  isAgentCaller,
  reason,
}: {
  from: TicketStatus;
  to: TicketStatus;
  isAgentCaller: boolean;
  reason: string | undefined;
}) => {
  const normalizedReason = normalizeStatusReason(reason);
  const transitionClass = getTransitionClass(from, to);
  if (isAgentCaller && from !== to && transitionClass === "non_standard" && !normalizedReason) {
    throw new Error("Reason is required for non-standard status transitions");
  }
  return {
    transitionClass,
    reason: normalizedReason,
  };
};
