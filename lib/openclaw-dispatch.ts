type TicketLine = {
  _id: string;
  number?: number;
  title: string;
  description?: string;
};

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
};

export const buildOpenClawDispatchMessage = (args: {
  workspaceName: string;
  workspaceId: string;
  workspaceDocs?: string;
  tickets: TicketLine[];
}) => {
  const lines = args.tickets.map((ticket, index) => {
    const ticketLabel =
      ticket.number === undefined ? "Ticket" : `Ticket #${ticket.number}`;
    const header = `${index + 1}. ${ticketLabel}: ${ticket.title} (ID: ${ticket._id})`;
    const description = ticket.description?.trim();
    if (!description) return header;
    return `${header}\n   Description: ${truncate(description, 240)}`;
  });

  const workspaceDocs = args.workspaceDocs?.trim();
  const workspaceDocsSection = workspaceDocs
    ? `Workspace docs (truncated):\n${truncate(workspaceDocs, 500)}\n\n`
    : "";

  return (
    `KanbanThing dispatch: ${args.tickets.length} tickets from workspace ` +
    `${args.workspaceName} (ID: ${args.workspaceId})\n\n` +
    workspaceDocsSection +
    `${lines.join("\n")}\n\n` +
    "Use the KanbanThing API to fetch full details, claim, and work on each ticket. " +
    "Spawn a subagent per ticket."
  );
};
