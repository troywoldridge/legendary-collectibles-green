"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "admin_ui_token";

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,   // ✅ production-safe (requires https)
  path: "/",
};

export async function setAdminToken(formData: FormData) {
  const submitted = String(formData.get("token") || "").trim();
  const required = (process.env.ADMIN_UI_TOKEN || "").trim();

  const jar = await cookies();

  if (!required) {
    // If no token set in env, allow free entry
    jar.set(COOKIE_NAME, "dev-open", cookieOpts);
    redirect("/admin");
  }

  if (submitted && submitted === required) {
    jar.set(COOKIE_NAME, submitted, cookieOpts);
    redirect("/admin");
  }

  redirect("/admin?err=1");
}

export async function clearAdminToken() {
  const jar = await cookies();
  // delete cookie (maxAge 0 is the simplest)
  jar.set(COOKIE_NAME, "", { ...cookieOpts, maxAge: 0 });
  redirect("/admin");
}
