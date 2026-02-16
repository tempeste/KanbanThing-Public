"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
            This usually happens when the session expires after being idle. Reload to reconnect.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "#fafafa",
              color: "#0a0a0a",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
