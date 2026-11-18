const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export class CatalogError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function inventoryRequest(
  businessId: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") {
    const response = await fetch(`${api}/api/auth/csrf`, {
      credentials: "include",
      cache: "no-store",
      signal: init.signal,
    });
    if (!response.ok)
      throw new CatalogError(
        "Unable to verify your session. Please sign in again.",
        response.status,
      );
    const csrf: { headerName: string; token: string } = await response.json();
    headers.set(csrf.headerName, csrf.token);
    if (!(init.body instanceof FormData))
      headers.set("Content-Type", "application/json");
  }
  const response = await fetch(
    `${api}/api/businesses/${encodeURIComponent(businessId)}/inventory${path}`,
    {
      ...init,
      headers,
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      detail?: string;
      errors?: { row: number; message: string }[];
    };
    const message =
      response.status === 401
        ? "Your session expired. Please sign in again."
        : response.status === 403
          ? "Your Inventory access changed. Select the business again or contact your administrator."
          : (problem.detail ??
            "Unable to complete this request. Please try again.");
    throw new CatalogError(
      [
        message,
        ...(problem.errors ?? []).map((e) => `Row ${e.row}: ${e.message}`),
      ].join("\n"),
      response.status,
    );
  }
  return response;
}

export function catalogRequest(
  businessId: string,
  path: string,
  init: RequestInit = {},
) {
  return inventoryRequest(businessId, `/catalog${path}`, init);
}
