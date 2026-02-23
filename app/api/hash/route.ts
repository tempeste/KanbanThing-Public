import { createHash } from "crypto";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    value?: unknown;
  } | null;

  if (!body || typeof body.value !== "string") {
    return Response.json({ error: "Missing value" }, { status: 400 });
  }

  const hash = createHash("sha256").update(body.value).digest("hex");
  return Response.json({ hash });
}
