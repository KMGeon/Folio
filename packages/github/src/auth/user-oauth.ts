/**
 * GitHub App user-to-server OAuth. The access token is used transiently for
 * authenticated-user APIs, then discarded and never persisted.
 */
export interface OAuthUser {
  id: number;
  login: string;
  avatarUrl: string;
  email: string | null;
}

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_INSTALLATIONS_URL = "https://api.github.com/user/installations";

export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeOAuthCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  const res = await doFetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.error || !data.access_token) {
    throw new Error(`GitHub token exchange failed: ${data.error ?? "no access_token"}`);
  }
  return { accessToken: data.access_token };
}

export async function getAuthenticatedUser(input: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthUser> {
  const doFetch = input.fetchImpl ?? fetch;
  const res = await doFetch(USER_URL, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "folio",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub /user failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    id: number;
    login: string;
    avatar_url: string;
    email: string | null;
  };
  return {
    id: data.id,
    login: data.login,
    avatarUrl: data.avatar_url,
    email: data.email ?? null,
  };
}

export async function verifyUserInstallationAccess(input: {
  accessToken: string;
  installationId: number;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const doFetch = input.fetchImpl ?? fetch;
  const perPage = 100;
  let page = 1;
  let seen = 0;

  for (;;) {
    const url = new URL(USER_INSTALLATIONS_URL);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    const res = await doFetch(url.toString(), {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "folio",
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub user installation access check failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      total_count?: number;
      installations?: { id?: number }[];
    };
    if (!Array.isArray(data.installations) || typeof data.total_count !== "number") {
      throw new Error("GitHub user installation access check returned an invalid list response");
    }
    if (data.installations.some((installation) => installation.id === input.installationId)) {
      return;
    }
    seen += data.installations.length;
    if (data.installations.length < perPage || seen >= data.total_count) {
      break;
    }
    page += 1;
  }

  throw new Error(
    `GitHub user installation access check did not find installation ${input.installationId}`,
  );
}
