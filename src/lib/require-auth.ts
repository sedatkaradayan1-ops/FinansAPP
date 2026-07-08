import { redirect } from "@tanstack/react-router";

import { getSessionUser } from "./api/session.functions";
import type { CurrentUser } from "./auth.server";

/**
 * Use in a protected route's `beforeLoad`. `getSessionUser` is a TanStack
 * server function, so this works correctly both during SSR (direct call) and
 * client-side navigation (RPC call) — never call bindings()/cloudflare:workers
 * APIs directly from a route module since beforeLoad also runs in the browser.
 */
export async function requireAuthLoader(): Promise<{ user: NonNullable<CurrentUser> }> {
  const user = await getSessionUser();
  if (!user) {
    throw redirect({ to: "/giris" });
  }
  return { user };
}

