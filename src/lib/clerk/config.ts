// src/lib/clerk/config.ts
import "server-only";

type ClerkMode = "live" | "test" | "unknown";

type ClerkEnv = {
  publishableKey: string;
  secretKey: string;
  proxyUrl?: string;
};

function detectMode(key: string): ClerkMode {
  if (!key) return "unknown";
  if (/_live_/.test(key)) return "live";
  if (/_test_/.test(key)) return "test";
  return "unknown";
}

function readEnv(): ClerkEnv {
  const publishableKey = (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY ??
    ""
  ).trim();

  const secretKey = (
    process.env.CLERK_SECRET_KEY ??
    process.env.CLERK_API_KEY ??
    ""
  ).trim();

  const proxyUrl = (
    process.env.CLERK_PROXY_URL ||
    process.env.NEXT_PUBLIC_CLERK_PROXY_URL ||
    ""
  ).trim();

  return {
    publishableKey,
    secretKey,
    proxyUrl: proxyUrl || undefined,
  } satisfies ClerkEnv;
}

function validate(env: ClerkEnv) {
  const { publishableKey, secretKey } = env;

  if (!publishableKey) {
    throw new Error(
      "Clerk publishable key is missing. Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY) to the same instance that owns your secret key to avoid token refresh loops.",
    );
  }

  if (!secretKey) {
    throw new Error(
      "Clerk secret key is missing. Set CLERK_SECRET_KEY (or CLERK_API_KEY) so Clerk can refresh session tokens without redirect loops.",
    );
  }

  const publishableMode = detectMode(publishableKey);
  const secretMode = detectMode(secretKey);

  if (
    publishableMode !== "unknown" &&
    secretMode !== "unknown" &&
    publishableMode !== secretMode
  ) {
    throw new Error(
      `Clerk keys come from different instances (publishable: ${publishableMode}, secret: ${secretMode}). Copy both keys from the same Clerk environment to prevent the \"infinite redirect loop\" session error.`,
    );
  }
}

let cached: ClerkEnv | null = null;

function getClerkEnv(): ClerkEnv {
  if (cached) return cached;

  const env = readEnv();
  validate(env);
  cached = env;
  return env;
}

export function getClerkFrontendConfig(): Pick<ClerkEnv, "publishableKey" | "proxyUrl"> {
  const env = getClerkEnv();
  return {
    publishableKey: env.publishableKey,
    proxyUrl: env.proxyUrl,
  };
}

export function getClerkMiddlewareConfig(): ClerkEnv {
  return getClerkEnv();
}
