"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#16233a" }}>
        <div style={{ maxWidth: 480, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>LIGHT is temporarily unavailable</h1>
          <p style={{ color: "#6b716c", fontSize: 14 }}>Please try again in a moment. No data has been changed.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, background: "#1f4e96", color: "#fff", border: 0, borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
