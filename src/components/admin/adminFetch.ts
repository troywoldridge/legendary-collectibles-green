export async function adminFetch(input: RequestInfo, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers || {}),
    },
  });
}
