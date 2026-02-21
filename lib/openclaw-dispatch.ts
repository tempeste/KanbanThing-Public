type TicketLine = {
  _id: string;
  number?: number;
  title: string;
};

export const buildOpenClawDispatchMessage = (args: {
  workspaceName: string;
  workspaceId: string;
  tickets: TicketLine[];
}) => {
  const lines = args.tickets.map((ticket, index) => {
    const ticketLabel =
      ticket.number === undefined ? "Ticket" : `Ticket #${ticket.number}`;
    return `${index + 1}. ${ticketLabel}: ${ticket.title} (ID: ${ticket._id})`;
  });

  return (
    `KanbanThing dispatch: ${args.tickets.length} tickets from workspace ` +
    `${args.workspaceName} (ID: ${args.workspaceId})\n\n` +
    `${lines.join("\n")}\n\n` +
    "Use the KanbanThing API to fetch full details, claim, and work on each ticket. " +
    "Spawn a subagent per ticket."
  );
};

