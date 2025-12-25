import { getAdminToken } from "./AdminTokenGate";

export async function adminFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getAdminToken();
  const headers = new Headers(init.headers || {});
  headers.set("x-admin-token", token);
  return fetch(input, { ...init, headers });
}
