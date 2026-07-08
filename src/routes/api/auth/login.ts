import { createFileRoute } from "@tanstack/react-router";

import { bindings } from "@/lib/bindings.server";
import { buildSetCookie, hashPassword, randomToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth.server";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { DB } = bindings();
        if (!DB) {
          return Response.json({ ok: false, error: "NO_DB" }, { status: 500 });
        }
        let body: { password?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ ok: false, error: "BAD_BODY" }, { status: 400 });
        }
        const password = body.password ?? "";

        const user = await DB.prepare(
          "SELECT id, password_hash, password_salt FROM users ORDER BY created_at ASC LIMIT 1",
        ).first<{ id: string; password_hash: string; password_salt: string }>();
        if (!user) {
          return Response.json({ ok: false, error: "NO_ACCOUNT" }, { status: 404 });
        }

        const attempt = await hashPassword(password, user.password_salt);
        if (attempt !== user.password_hash) {
          return Response.json({ ok: false, error: "WRONG_PASSWORD" }, { status: 401 });
        }

        const sessionId = randomToken();
        const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
        await DB.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
          .bind(sessionId, user.id, expiresAt)
          .run();

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "set-cookie": buildSetCookie(SESSION_COOKIE, sessionId, SESSION_DAYS * 86_400),
          },
        });
      },
    },
  },
});

