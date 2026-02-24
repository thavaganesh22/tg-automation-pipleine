import type { EmploymentStatus } from "../types/employee";

interface Props { status: EmploymentStatus; }

export function StatusBadge({ status }: Props) {
  const cls =
    status === "Active"     ? "badge badge-active" :
    status === "On Leave"   ? "badge badge-leave"  :
                              "badge badge-terminated";
  return (
    <span className={cls}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}
