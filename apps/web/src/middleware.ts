import { type NextRequest, NextResponse } from "next/server";

// Public paths: login, brand assets, and Next internals. The marketing home is
// the site root ("/") — matched exactly below, because a "/" *prefix* would
// match every path and disable the gate entirely.
const PUBLIC_PREFIXES = [
  "/login",
  "/_next",
  "/favicon",
  "/icon.png",
  "/apple-icon.png",
  "/folio-mark.png",
  "/folio-wordmark.png",
];

/**
 * App-wide session gate: redirect to /login when the session cookie is absent.
 * Real authorization (and private-repo access) is enforced by the backend; this
 * is the coarse UX gate so unauthenticated users never see app chrome. The
 * public marketing home ("/") and the login screen stay outside the gate.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (pathname === "/" || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const requestedPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!req.cookies.has("folio_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", requestedPath);
    return NextResponse.redirect(url);
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-folio-request-path", requestedPath);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
