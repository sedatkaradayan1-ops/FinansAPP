import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "@/lib/bindings.server";

export const Route = createFileRoute("/api/auth/register-status")({
  server: {
    handlers: {
      GET: async () => {
        const { DB } = bindings();
        if (!DB) return Response.json({ hasUser: false });
        const row = await DB.prepare("SELECT COUNT(*) AS n FROM users").first<{ n: number }>();
        return Response.json({ hasUser: (row?.n ?? 0) > 0 });
      },
    },
  },
});

