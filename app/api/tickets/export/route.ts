import { NextRequest } from "next/server";
import { validateApiKey, getConvexClient } from "@/lib/api-auth";
import { api } from "@/convex/_generated/api";
import { serializeTicket } from "@/lib/api-serializers";
import { jsonError, sanitizeServerError } from "@/lib/api-route-helpers";

const CSV_COLUMNS = [
  "id",
  "number",
  "title",
  "description",
  "status",
  "priority",
  "tags",
  "ownerId",
  "ownerType",
  "ownerDisplayName",
  "parentId",
  "order",
  "archived",
  "childCount",
  "childDoneCount",
  "createdAt",
  "updatedAt",
] as const;

const escapeCSV = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (auth instanceof Response) return auth;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format")?.trim() ?? "json";
    if (format !== "json" && format !== "csv") {
      return jsonError('Invalid format. Must be "json" or "csv"', 400);
    }

    const convex = getConvexClient();
    const tickets = await convex.query(api.tickets.list, {
      workspaceId: auth.workspaceId,
      agentApiKeyId: auth.apiKeyId,
    });

    if (format === "csv") {
      const header = CSV_COLUMNS.join(",");
      const rows = tickets.map((ticket) => {
        const serialized = serializeTicket(ticket);
        return CSV_COLUMNS.map((col) =>
          escapeCSV(serialized[col as keyof typeof serialized])
        ).join(",");
      });
      const csv = [header, ...rows].join("\n");

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="tickets-export.csv"`,
        },
      });
    }

    const serialized = tickets.map(serializeTicket);
    const json = JSON.stringify({ tickets: serialized, exportedAt: new Date().toISOString() }, null, 2);

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tickets-export.json"`,
      },
    });
  } catch (error) {
    return jsonError(sanitizeServerError(error), 500);
  }
}
