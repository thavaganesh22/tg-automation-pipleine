import { useState, useEffect, useCallback, useRef } from "react";
import type {
  EmployeeListItem, Employee, Pagination, CreateEmployeeInput,
} from "../types/employee";
import { DEPARTMENTS, EMPLOYMENT_STATUSES } from "../types/employee";
import { employeeApi } from "../api/employeeApi";
import { EmployeeTable } from "../components/EmployeeTable";
import { EmployeeDrawer } from "../components/EmployeeDrawer";
import { ConfirmDialog } from "../components/ConfirmDialog";

type DrawerMode = "create" | "edit" | null;

export function EmployeesPage() {
  // ── List state ──────────────────────────────────────────────────────────────
  const [employees,  setEmployees]  = useState<EmployeeListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total:0, page:1, limit:20, pages:0 });
  const [loading,    setLoading]    = useState(true);
  const [listError,  setListError]  = useState<string | null>(null);

  // ── Filter / search state ───────────────────────────────────────────────────
  const [search,     setSearch]     = useState("");
  const [department, setDepartment] = useState("");
  const [status,     setStatus]     = useState("");
  const [page,       setPage]       = useState(1);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Drawer state ────────────────────────────────────────────────────────────
  const [drawerMode,   setDrawerMode]   = useState<DrawerMode>(null);
  const [selected,     setSelected]     = useState<Employee | null>(null);
  const [loadingEmp,   setLoadingEmp]   = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [drawerError,  setDrawerError]  = useState<string | null>(null);

  // ── Confirm delete ──────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting,      setDeleting]      = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ── Fetch employees ─────────────────────────────────────────────────────────
  const fetchEmployees = useCallback(async (opts: {
    page: number; search: string; department: string; status: string;
  }) => {
    setLoading(true);
    setListError(null);
    try {
      const res = await employeeApi.list({
        page:       opts.page,
        limit:      20,
        search:     opts.search || undefined,
        department: opts.department || undefined,
        status:     opts.status || undefined,
      });
      setEmployees(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when filters change
  useEffect(() => {
    fetchEmployees({ page, search, department, status });
  }, [page, department, status, fetchEmployees]);

  // Debounced search
  function handleSearch(value: string) {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      fetchEmployees({ page: 1, search: value, department, status });
    }, 350);
  }

  function handleFilterChange(key: "department" | "status", value: string) {
    setPage(1);
    if (key === "department") setDepartment(value);
    else                      setStatus(value);
  }

  // ── Open employee detail ────────────────────────────────────────────────────
  async function openEmployee(id: string) {
    setDrawerMode("edit");
    setSelected(null);
    setDrawerError(null);
    setLoadingEmp(true);
    try {
      const emp = await employeeApi.get(id);
      setSelected(emp);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Failed to load employee");
    } finally {
      setLoadingEmp(false);
    }
  }

  function openCreate() {
    setSelected(null);
    setDrawerError(null);
    setDrawerMode("create");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setSelected(null);
    setDrawerError(null);
    setConfirmDelete(false);
  }

  // ── Save (create or update) ─────────────────────────────────────────────────
  async function handleSave(data: CreateEmployeeInput) {
    setSaving(true);
    setDrawerError(null);
    try {
      if (drawerMode === "create") {
        await employeeApi.create(data);
        showToast("Employee added successfully");
      } else if (selected) {
        await employeeApi.update(selected._id, data);
        showToast("Changes saved");
      }
      closeDrawer();
      fetchEmployees({ page, search, department, status });
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    try {
      await employeeApi.delete(selected._id);
      showToast(`${selected.firstName} ${selected.lastName} deleted`);
      closeDrawer();
      fetchEmployees({ page, search, department, status });
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Delete failed");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  const activeCount = employees.filter((e) => e.employmentStatus === "Active").length;

  return (
    <>
      <div className="page-header">
        <div className="page-header-text">
          <h1>Employee Directory</h1>
          <p>
            {pagination.total > 0
              ? `${pagination.total} employee${pagination.total !== 1 ? "s" : ""} · ${activeCount} active on this page`
              : "No employees yet"}
          </p>
        </div>
        <button data-testid="add-employee-btn" className="btn btn-primary" onClick={openCreate}>
          + Add employee
        </button>
      </div>

      {/* Error banner */}
      {listError && (
        <div data-testid="error-banner" className="error-banner" style={{ marginBottom: 16 }}>
          ⚠ {listError}
          <button
            data-testid="retry-btn"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => fetchEmployees({ page, search, department, status })}
          >
            Retry
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div data-testid="success-toast" className="success-banner" style={{ marginBottom: 16 }}>
          ✓ {toast}
        </div>
      )}

      {/* Controls */}
      <div className="controls-bar">
        <div className="input-search-wrap">
          <span className="input-search-icon">⌕</span>
          <input
            data-testid="search-input"
            className="input input-search"
            type="search"
            placeholder="Search name, email, title…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <select
          data-testid="department-filter"
          className="select"
          value={department}
          onChange={(e) => handleFilterChange("department", e.target.value)}
        >
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          data-testid="status-filter"
          className="select"
          value={status}
          onChange={(e) => handleFilterChange("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {EMPLOYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {(search || department || status) && (
          <button
            data-testid="clear-filters-btn"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch(""); setDepartment(""); setStatus(""); setPage(1);
              fetchEmployees({ page: 1, search: "", department: "", status: "" });
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <EmployeeTable
        employees={employees}
        pagination={pagination}
        loading={loading}
        onSelect={openEmployee}
        onPage={(p) => setPage(p)}
      />

      {/* Drawer */}
      {drawerMode && (
        <EmployeeDrawer
          employee={drawerMode === "edit" ? (loadingEmp ? null : selected) : null}
          onSave={handleSave}
          onClose={closeDrawer}
          onDelete={drawerMode === "edit" ? () => setConfirmDelete(true) : undefined}
          saving={saving}
          error={drawerError}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && selected && (
        <ConfirmDialog
          name={`${selected.firstName} ${selected.lastName}`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          loading={deleting}
        />
      )}
    </>
  );
}
