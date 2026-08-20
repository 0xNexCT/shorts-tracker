import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, makeSessionId } from "./session-constants";

/**
 * Resolve the current anonymous user from the session cookie.
 * - No cookie  -> generates an id, sets the cookie, creates the user row.
 * - Cookie but unknown/deleted user -> creates a fresh row for that id.
 * Returns the user's uuid for scoping every query.
 */
export async function getOrCreateSessionUserId(): Promise<string> {
  const store = cookies();
  let sessionId = store.get(SESSION_COOKIE)?.value;

  if (!sessionId) {
    sessionId = makeSessionId();
    store.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  }

  const existing = await prisma.user.findUnique({ where: { id: sessionId } });
  if (!existing) {
    await prisma.user.create({ data: { id: sessionId } });
    store.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  }

  return sessionId;
}