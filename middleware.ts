import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, makeSessionId } from "@/lib/session-constants";

/**
 * Ensures every request (page or API) carries a session_id cookie before it
 * executes, so anonymous per-user isolation works even on the very first load.
 * The cookie is httpOnly + secure — client JS can neither read nor modify it.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (hasSession) {
    return NextResponse.next();
  }

  const sessionId = makeSessionId();

  // Clone the request with the new cookie so downstream API routes (which read
  // next/headers cookies) see the exact same id — avoids double cookies.
  const requestWithCookie = new NextRequest(request, { headers: request.headers });
  requestWithCookie.cookies.set({
    name: SESSION_COOKIE,
    value: sessionId,
    ...SESSION_COOKIE_OPTIONS,
  });

  const response = NextResponse.next({ request: requestWithCookie });
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)"],
};