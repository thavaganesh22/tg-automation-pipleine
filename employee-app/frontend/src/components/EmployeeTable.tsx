import type { EmployeeListItem, Pagination } from "../types/employee";
import { Avatar } from "./Avatar";
import { StatusBadge } from "./StatusBadge";

interface Props {
  employees:  EmployeeListItem[];
  pagination: Pagination;
  loading:    boolean;
  onSelect:   (id: string) => void;
  onPage:     (page: number) => void;
}

export function EmployeeTable({
  employees, pagination, loading, onSelect, onPage,
}: Props) {
  const { total, page, limit, pages } = pagination;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th className="hide-mobile">Designation</th>
            <th className="hide-mobile">Department</th>
            <th>Status</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="loading-row">
              <td colSpan={5}>
                <span className="spinner" />
              </td>
            </tr>
          ) : employees.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <p>No employees found</p>
                </div>
              </td>
            </tr>
          ) : (
            employees.map((emp) => (
              <tr key={emp._id} onClick={() => onSelect(emp._id)}>
                <td>
                  <div className="td-name">
                    <Avatar firstName={emp.firstName} lastName={emp.lastName} />
                    <div>
                      <div className="name-full">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="name-email">{emp.email}</div>
                    </div>
                  </div>
                </td>
                <td className="hide-mobile" style={{ color: "var(--text-secondary)" }}>
                  {emp.designation}
                </td>
                <td className="hide-mobile">
                  <span className="badge badge-dept">{emp.department}</span>
                </td>
                <td>
                  <StatusBadge status={emp.employmentStatus} />
                </td>
                <td style={{ color: "var(--text-muted)", textAlign: "center" }}>›</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="pagination">
        <span>
          {total === 0
            ? "No results"
            : `${start}–${end} of ${total} employee${total !== 1 ? "s" : ""}`}
        </span>
        <div className="pagination-controls">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page <= 1 || loading}
            onClick={() => onPage(page - 1)}
          >
            ← Prev
          </button>
          <span style={{ padding: "0 8px", color: "var(--text-muted)", fontSize: 12 }}>
            {page} / {Math.max(pages, 1)}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= pages || loading}
            onClick={() => onPage(page + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
