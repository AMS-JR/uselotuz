export const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number) {
    super("Request failed");
  }
}

export async function read<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json() as Promise<T>;
}

export async function mutate(
  path: string,
  method: "POST" | "PATCH",
  body?: unknown,
) {
  const csrf = await read<{ headerName: string; token: string }>(
    "/api/auth/csrf",
  );
  const response = await fetch(`${api}${path}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      [csrf.headerName]: csrf.token,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response;
}

export function loginUrl(signup = false) {
  const query = new URLSearchParams({ app: "workspace", returnTo: "/" });
  if (signup) query.set("screen_hint", "signup");
  return `${api}/oauth2/authorization/lotuz?${query}`;
}
