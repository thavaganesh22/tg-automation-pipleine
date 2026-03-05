import type { Employee, CreateEmployeeInput } from "../types/employee";
import { EmployeeForm } from "./EmployeeForm";
import { StatusBadge } from "./StatusBadge";

interface Props {
  employee?:  Employee | null;
  onSave:     (data: CreateEmployeeInput) => Promise<void>;
  onClose:    () => void;
  onDelete?:  () => void;
  saving?:    boolean;
  error?:     string | null;
}

export function EmployeeDrawer({
  employee, onSave, onClose, onDelete, saving, error,
}: Props) {
  const isEdit = Boolean(employee);
  const initials = employee
    ? `${employee.firstName[0] ?? ""}${employee.lastName[0] ?? ""}`.toUpperCase()
    : null;

  return (
    <div data-testid="drawer-overlay" className="overlay" onClick={onClose}>
      <div data-testid="employee-drawer" className="drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          {isEdit && employee ? (
            <div className="detail-header" style={{ padding: 0, border: "none", flex: 1 }}>
              <div className="detail-avatar">{initials}</div>
              <div style={{ flex: 1 }}>
                <div className="detail-name">
                  {employee.firstName} {employee.lastName}
                </div>
                <div className="detail-designation">{employee.designation}</div>
                <div className="detail-meta">
                  <StatusBadge status={employee.employmentStatus} />
                  <span className="badge badge-dept">{employee.department}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="drawer-title">Add employee</div>
              <div className="drawer-subtitle">Fill in the details below</div>
            </div>
          )}
          <button data-testid="close-drawer-btn" className="btn btn-ghost btn-icon" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "0 24px", paddingTop: 12, flexShrink: 0 }}>
            <div data-testid="drawer-error" className="error-banner">⚠ {error}</div>
          </div>
        )}

        {/* Form (contains body + footer) */}
        <EmployeeForm
          employee={employee}
          onSave={onSave}
          onCancel={onClose}
          onDelete={onDelete}
          saving={saving}
        />
      </div>
    </div>
  );
}
