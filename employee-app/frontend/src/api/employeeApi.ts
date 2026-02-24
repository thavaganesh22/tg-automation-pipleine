import type {
  Employee,
  EmployeeListItem,
  ListResponse,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../types/employee";

const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (res.status === 204) return undefined as unknown as T;

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = (body as { message?: string }).message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return body as T;
}

// ── Employee API ──────────────────────────────────────────────────────────────

export interface ListParams {
  page?:       number;
  limit?:      number;
  search?:     string;
  department?: string;
  status?:     string;
}

export const employeeApi = {
  list(params: ListParams = {}): Promise<ListResponse> {
    const qs = new URLSearchParams();
    if (params.page)       qs.set("page",       String(params.page));
    if (params.limit)      qs.set("limit",      String(params.limit));
    if (params.search)     qs.set("search",     params.search);
    if (params.department) qs.set("department", params.department);
    if (params.status)     qs.set("status",     params.status);
    const query = qs.toString() ? `?${qs}` : "";
    return request<ListResponse>(`/employees${query}`);
  },

  get(id: string): Promise<Employee> {
    return request<Employee>(`/employees/${id}`);
  },

  create(data: CreateEmployeeInput): Promise<Employee> {
    return request<Employee>("/employees", {
      method: "POST",
      body:   JSON.stringify(data),
    });
  },

  update(id: string, data: UpdateEmployeeInput): Promise<Employee> {
    return request<Employee>(`/employees/${id}`, {
      method: "PATCH",
      body:   JSON.stringify(data),
    });
  },

  delete(id: string): Promise<void> {
    return request<void>(`/employees/${id}`, { method: "DELETE" });
  },
};

// Unused export kept for tree-shaking test purposes
export type { Employee, EmployeeListItem };
