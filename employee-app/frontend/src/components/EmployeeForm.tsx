import { useState, useEffect } from "react";
import type { Employee, CreateEmployeeInput } from "../types/employee";
import {
  DEPARTMENTS, EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES,
} from "../types/employee";

type FormData = {
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string;
  cellPhone:        string;
  designation:      string;
  department:       string;
  employmentType:   string;
  employmentStatus: string;
  startDate:        string;
  address: {
    street:     string;
    city:       string;
    state:      string;
    postalCode: string;
    country:    string;
  };
};

type Errors = Partial<Record<
  | keyof Omit<FormData, "address">
  | "address.street" | "address.city" | "address.country",
  string
>>;

function toFormData(emp?: Employee | null): FormData {
  return {
    firstName:        emp?.firstName        ?? "",
    lastName:         emp?.lastName         ?? "",
    email:            emp?.email            ?? "",
    phone:            emp?.phone            ?? "",
    cellPhone:        emp?.cellPhone        ?? "",
    designation:      emp?.designation      ?? "",
    department:       emp?.department       ?? "",
    employmentType:   emp?.employmentType   ?? "",
    employmentStatus: emp?.employmentStatus ?? "Active",
    startDate:        emp?.startDate
      ? emp.startDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
    address: {
      street:     emp?.address?.street     ?? "",
      city:       emp?.address?.city       ?? "",
      state:      emp?.address?.state      ?? "",
      postalCode: emp?.address?.postalCode ?? "",
      country:    emp?.address?.country    ?? "",
    },
  };
}

function validate(data: FormData): Errors {
  const errs: Errors = {};
  if (!data.firstName.trim())        errs.firstName        = "Required";
  if (!data.lastName.trim())         errs.lastName         = "Required";
  if (!data.email.trim())            errs.email            = "Required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
                                     errs.email            = "Invalid email";
  if (!data.designation.trim())      errs.designation      = "Required";
  if (!data.department)              errs.department       = "Required";
  if (!data.employmentType)          errs.employmentType   = "Required";
  if (!data.employmentStatus)        errs.employmentStatus = "Required";
  if (!data.startDate)               errs.startDate        = "Required";
  if (!data.address.street.trim())   errs["address.street"]  = "Required";
  if (!data.address.city.trim())     errs["address.city"]    = "Required";
  if (!data.address.country.trim())  errs["address.country"] = "Required";
  return errs;
}

interface Props {
  employee?:   Employee | null;   // null/undefined = create mode
  onSave:      (data: CreateEmployeeInput) => Promise<void>;
  onCancel:    () => void;
  onDelete?:   () => void;
  saving?:     boolean;
}

export function EmployeeForm({ employee, onSave, onCancel, onDelete, saving }: Props) {
  const isEdit = Boolean(employee);
  const [form,   setForm]   = useState<FormData>(() => toFormData(employee));
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);

  // Re-initialise when a different employee is loaded
  useEffect(() => {
    setForm(toFormData(employee));
    setErrors({});
    setTouched(false);
  }, [employee?._id]);

  function set(field: keyof Omit<FormData, "address">, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (touched) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function setAddr(field: keyof FormData["address"], value: string) {
    setForm((f) => ({ ...f, address: { ...f.address, [field]: value } }));
    if (touched) setErrors((e) => ({ ...e, [`address.${field}`]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    await onSave(form as unknown as CreateEmployeeInput);
  }

  const F = ({ id, label, required, children }: {
    id: string; label: string; required?: boolean; children: React.ReactNode;
  }) => (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}{required && <span className="required"> *</span>}
      </label>
      {children}
    </div>
  );

  const err = (k: keyof Errors) =>
    errors[k] ? <p data-testid={`${String(k).replace(".", "-")}-error`} className="form-error">{errors[k]}</p> : null;

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
      {/* ── Personal ─────────────────────────────────────────── */}
      <div className="drawer-body">
        <div className="form-section">
          <div className="form-section-title">Personal Information</div>
          <div className="form-grid">
            <F id="firstName" label="First name" required>
              <input
                id="firstName" data-testid="firstName-input" className={`form-input${errors.firstName ? " invalid" : ""}`}
                value={form.firstName} onChange={(e) => set("firstName", e.target.value)}
                placeholder="Thava" autoFocus
              />
              {err("firstName")}
            </F>
            <F id="lastName" label="Last name" required>
              <input
                id="lastName" data-testid="lastName-input" className={`form-input${errors.lastName ? " invalid" : ""}`}
                value={form.lastName} onChange={(e) => set("lastName", e.target.value)}
                placeholder="Gopal"
              />
              {err("lastName")}
            </F>
            <F id="email" label="Email" required>
              <input
                id="email" data-testid="email-input" type="email" className={`form-input${errors.email ? " invalid" : ""}`}
                value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="name@company.com"
              />
              {err("email")}
            </F>
            <F id="phone" label="Work Phone">
              <input
                id="phone" data-testid="phone-input" className="form-input"
                value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="+1-416-555-0192"
              />
            </F>
            <F id="cellPhone" label="Cell Phone">
              <input
                id="cellPhone" data-testid="cellPhone-input" className="form-input"
                value={form.cellPhone} onChange={(e) => set("cellPhone", e.target.value)}
                placeholder="+1-416-555-0193"
              />
            </F>
          </div>
        </div>

        {/* ── Role ──────────────────────────────────────────── */}
        <div className="form-section">
          <div className="form-section-title">Role & Employment</div>
          <div className="form-grid">
            <F id="designation" label="Designation" required>
              <input
                id="designation" data-testid="designation-input" className={`form-input${errors.designation ? " invalid" : ""}`}
                value={form.designation} onChange={(e) => set("designation", e.target.value)}
                placeholder="Senior QA Engineer"
              />
              {err("designation")}
            </F>
            <F id="department" label="Department" required>
              <select
                id="department" data-testid="department-select" className={`form-select${errors.department ? " invalid" : ""}`}
                value={form.department} onChange={(e) => set("department", e.target.value)}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              {err("department")}
            </F>
            <F id="employmentType" label="Employment type" required>
              <select
                id="employmentType" data-testid="employmentType-select" className={`form-select${errors.employmentType ? " invalid" : ""}`}
                value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}
              >
                <option value="">Select type</option>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {err("employmentType")}
            </F>
            <F id="employmentStatus" label="Status" required>
              <select
                id="employmentStatus" data-testid="employmentStatus-select" className={`form-select${errors.employmentStatus ? " invalid" : ""}`}
                value={form.employmentStatus} onChange={(e) => set("employmentStatus", e.target.value)}
              >
                {EMPLOYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {err("employmentStatus")}
            </F>
            <F id="startDate" label="Start date" required>
              <input
                id="startDate" data-testid="startDate-input" type="date" className={`form-input${errors.startDate ? " invalid" : ""}`}
                value={form.startDate} onChange={(e) => set("startDate", e.target.value)}
              />
              {err("startDate")}
            </F>
          </div>
        </div>

        {/* ── Address ───────────────────────────────────────── */}
        <div className="form-section">
          <div className="form-section-title">Address</div>
          <div className="form-grid">
            <div className="form-grid-full">
              <F id="street" label="Street address" required>
                <input
                  id="street" data-testid="street-input" className={`form-input${errors["address.street"] ? " invalid" : ""}`}
                  value={form.address.street} onChange={(e) => setAddr("street", e.target.value)}
                  placeholder="123 Innovation Drive"
                />
                {err("address.street")}
              </F>
            </div>
            <F id="city" label="City" required>
              <input
                id="city" data-testid="city-input" className={`form-input${errors["address.city"] ? " invalid" : ""}`}
                value={form.address.city} onChange={(e) => setAddr("city", e.target.value)}
                placeholder="Toronto"
              />
              {err("address.city")}
            </F>
            <F id="state" label="State / Province">
              <input
                id="state" data-testid="state-input" className="form-input"
                value={form.address.state} onChange={(e) => setAddr("state", e.target.value)}
                placeholder="Ontario"
              />
            </F>
            <F id="postalCode" label="Postal code">
              <input
                id="postalCode" data-testid="postalCode-input" className="form-input"
                value={form.address.postalCode} onChange={(e) => setAddr("postalCode", e.target.value)}
                placeholder="M5V 3A8"
              />
            </F>
            <F id="country" label="Country" required>
              <input
                id="country" data-testid="country-input" className={`form-input${errors["address.country"] ? " invalid" : ""}`}
                value={form.address.country} onChange={(e) => setAddr("country", e.target.value)}
                placeholder="Canada"
              />
              {err("address.country")}
            </F>
          </div>
        </div>
      </div>

      {/* ── Footer actions ────────────────────────────────────── */}
      <div className="drawer-footer">
        {isEdit && onDelete && (
          <button
            type="button"
            data-testid="delete-btn"
            className="btn btn-danger btn-sm"
            onClick={onDelete}
            disabled={saving}
            style={{ marginRight: "auto" }}
          >
            Delete
          </button>
        )}
        <button data-testid="cancel-btn" type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button data-testid="submit-btn" type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Add employee"}
        </button>
      </div>
    </form>
  );
}
