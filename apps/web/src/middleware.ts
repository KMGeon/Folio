import { type NextRequest, NextResponse } from "next/server";

// Public paths: the login screen and Next internals/assets.
const PUBLIC_PREFIXES = ["/login", "/_next", "/favicon"];

/**
 * App-wide session gate: redirect to /login when the session cookie is absent.
 * Real authorization (and private-repo access) is enforced by the backend; this
 * is the coarse UX gate so unauthenticated users never see app chrome.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.has("folio_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
