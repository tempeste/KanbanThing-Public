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

const MAX_METADATA_TICKETS = 20;
const MAX_METADATA_TITLE_LENGTH = 120;

export const buildOpenClawDispatchMessage = (args: {
  workspaceName: string;
  workspaceId: string;
  workspaceDocs?: string;
  callbackBaseUrl?: string;
  tickets: TicketLine[];
}) => {
  const callbackBaseUrl = args.callbackBaseUrl?.trim();
  const metadataTickets = args.tickets
    .slice(0, MAX_METADATA_TICKETS)
    .map((ticket) => ({
      id: ticket._id,
      number: ticket.number,
      title: truncate(ticket.title, MAX_METADATA_TITLE_LENGTH),
    }));
  const dispatchMetadata = {
    kanbanthing_dispatch_v: 1,
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    ticketCount: args.tickets.length,
    metadataTicketCount: metadataTickets.length,
    metadataTruncated: args.tickets.length > metadataTickets.length,
    tickets: metadataTickets,
    ...(callbackBaseUrl ? { callbackBaseUrl } : {}),
  };
  const dispatchMetadataBlock =
    "Dispatch metadata (machine-readable):\n```json\n" +
    `${JSON.stringify(dispatchMetadata, null, 2)}\n` +
    "```\n\n";

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
    dispatchMetadataBlock +
    workspaceDocsSection +
    `${lines.join("\n")}\n\n` +
    "Use the KanbanThing API to fetch full details, claim, and work on each ticket. " +
    "Spawn a subagent per ticket."
  );
};
