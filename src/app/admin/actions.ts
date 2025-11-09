"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "admin_ui_token";

export async function setAdminToken(formData: FormData) {
  const submitted = String(formData.get("token") || "");
  const required = process.env.ADMIN_UI_TOKEN || "";

  const jar = await cookies(); // mutable in a Server Action
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: true, path: "/" };

  if (!required) {
    // If no token set in env, allow free entry
    jar.set(COOKIE_NAME, "dev-open", opts);
    redirect("/admin");
  }

  if (submitted && submitted === required) {
    jar.set(COOKIE_NAME, submitted, opts);
    redirect("/admin");
  }

  // wrong token → back to form with a hint
  redirect("/admin?err=1");
}
