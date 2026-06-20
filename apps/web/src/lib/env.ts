export type AppProfile = "dev" | "prd";

export const webEnv = {
  profile: parseProfile(process.env.NEXT_PUBLIC_APP_PROFILE),
  apiBaseUrl: resolveApiBaseUrl(parseProfile(process.env.NEXT_PUBLIC_APP_PROFILE)),
};

function parseProfile(value: string | undefined): AppProfile {
  if (value === "prd") {
    return "prd";
  }
  return "dev";
}

function resolveApiBaseUrl(profile: AppProfile): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (profile === "dev") {
    return "http://localhost:8080";
  }
  throw new Error("NEXT_PUBLIC_API_BASE_URL is required when NEXT_PUBLIC_APP_PROFILE=prd");
}
