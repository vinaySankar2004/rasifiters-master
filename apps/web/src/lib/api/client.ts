import { API_BASE_URL } from "@/lib/config";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  token?: string | null;
  headers?: Record<string, string>;
};

let tokenRefreshHandler: (() => Promise<string | null>) | null = null;
let inflightRefresh: Promise<string | null> | null = null;

export function setTokenRefreshHandler(handler: (() => Promise<string | null>) | null) {
  tokenRefreshHandler = handler;
}

function coalescedRefresh(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  if (!tokenRefreshHandler) return Promise.resolve(null);
  inflightRefresh = tokenRefreshHandler().finally(() => {
    inflightRefresh = null;
  });
  return inflightRefresh;
}

export async function apiRequest<T>(
  path: string,
  { method = "GET", body, token, headers }: ApiRequestOptions = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 401 && token && tokenRefreshHandler) {
    const freshToken = await coalescedRefresh();
    if (freshToken) {
      const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${freshToken}`,
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!retryResponse.ok) {
        let message = `Request failed (${retryResponse.status})`;
        let details: unknown;
        try {
          const data = await retryResponse.json();
          message = data?.error || data?.message || message;
          details = data?.rowErrors;
        } catch {
          // ignore
        }
        throw new ApiError(message, retryResponse.status, details);
      }

      if (retryResponse.status === 204) {
        return {} as T;
      }

      return (await retryResponse.json()) as T;
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let details: unknown;
    try {
      const data = await response.json();
      message = data?.error || data?.message || message;
      details = data?.rowErrors;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}
