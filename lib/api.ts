export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "Respons server tidak valid." }));
  if (!response.ok) {
    if (response.status === 401 && path !== "auth/login" && path !== "auth/me")
      window.dispatchEvent(new Event("simora-session-expired"));
    throw Object.assign(new Error(result.error || "Permintaan gagal."), {
      status: response.status,
    });
  }
  return result;
}
