export const SESSION_COOKIE = "session_id";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Shared cookie attributes. httpOnly so client JS can never read or tamper
 * with the session id; secure on production (HTTPS) deploys.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
};

export function makeSessionId(): string {
  return crypto.randomUUID();
}