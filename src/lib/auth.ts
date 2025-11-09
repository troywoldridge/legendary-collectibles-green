// src/lib/auth.ts
import "server-only";
import { auth } from "@clerk/nextjs/server";

/** Returns Clerk userId, or DEV_FAKE_USER_ID in non-prod, else null */
export async function getUserIdOrDev(): Promise<string | null> {
  const { userId } = await auth();

  if (userId) return userId;
  if (process.env.NODE_ENV !== "production" && process.env.DEV_FAKE_USER_ID) {
    return process.env.DEV_FAKE_USER_ID;
  }
  return null;
}
