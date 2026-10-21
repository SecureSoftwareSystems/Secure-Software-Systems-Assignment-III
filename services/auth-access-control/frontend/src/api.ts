import type { ExclusionAction } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function login(username: string, password: string) {
  return request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function listExclusions(token: string) {
  return request<ExclusionAction[]>("/exclusions", { method: "GET" }, token);
}

export function createExclusion(token: string, candidateId: string, reason: string) {
  return request<ExclusionAction>(
    "/exclusions",
    { method: "POST", body: JSON.stringify({ candidateId, reason }) },
    token
  );
}

export function approveExclusion(token: string, id: number) {
  return request<ExclusionAction>(`/exclusions/${id}/approve`, { method: "POST" }, token);
}

export function rejectExclusion(token: string, id: number) {
  return request<ExclusionAction>(`/exclusions/${id}/reject`, { method: "POST" }, token);
}
