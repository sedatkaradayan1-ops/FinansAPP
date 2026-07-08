// Server-only auth helpers: password hashing (PBKDF2/WebCrypto), session
// cookie parsing, and DB-backed session validation. Actual login/register/
// logout are TanStack Start SERVER ROUTES (app/src/routes/api/auth/*.ts) so
// they get full Response control for Set-Cookie — see runtime-and-infra.md.
import { getRequest } from "@tanstack/react-start/server";

import { bindings } from "./bindings.server";

export const SESSION_COOKIE = "fkm_session";
export const SESSION_DAYS = 30;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

export function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function buildSetCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

export function buildClearCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

async function getSessionIdFromRequest(): Promise<string | null> {
  const request = getRequest();
  const cookies = parseCookies(request?.headers.get("cookie") ?? null);
  return cookies[SESSION_COOKIE] ?? null;
}

export type CurrentUser = {
  id: string;
  displayName: string;
  paydayDay: number;
  monthlyIncomeEstimate: number;
} | null;

/** Throws "UNAUTHENTICATED" if there is no valid session. Use inside server fns. */
export async function requireUserId(): Promise<string> {
  const { DB } = bindings();
  if (!DB) throw new Error("Veritabanı bağlantısı yok");
  const sid = await getSessionIdFromRequest();
  if (!sid) throw new Error("UNAUTHENTICATED");
  const row = await DB.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?")
    .bind(sid)
    .first<{ user_id: string; expires_at: string }>();
  if (!row) throw new Error("UNAUTHENTICATED");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("UNAUTHENTICATED");
  return row.user_id;
}

export async function readCurrentUser(): Promise<CurrentUser> {
  const { DB } = bindings();
  if (!DB) return null;
  try {
    const sid = await getSessionIdFromRequest();
    if (!sid) return null;
    const row = await DB.prepare(
      `SELECT u.id, u.display_name, u.payday_day, u.monthly_income_estimate, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
      .bind(sid)
      .first<{
        id: string;
        display_name: string;
        payday_day: number;
        monthly_income_estimate: number;
        expires_at: string;
      }>();
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      paydayDay: row.payday_day,
      monthlyIncomeEstimate: row.monthly_income_estimate,
    };
  } catch {
    return null;
  }
}



