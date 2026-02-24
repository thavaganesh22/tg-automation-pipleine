import { Schema, model, Document } from "mongoose";

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const AddressSchema = new Schema(
  {
    street:     { type: String, required: true, trim: true, maxlength: 200 },
    city:       { type: String, required: true, trim: true, maxlength: 100 },
    state:      { type: String, trim: true, maxlength: 100, default: "" },
    postalCode: { type: String, trim: true, maxlength: 20,  default: "" },
    country:    { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false }
);

// ── Enums ─────────────────────────────────────────────────────────────────────

export const DEPARTMENTS = [
  "Engineering", "Product", "Design", "QA", "DevOps",
  "Data", "Marketing", "Sales", "HR", "Finance", "Legal", "Operations", "Other",
] as const;

export const EMPLOYMENT_TYPES = ["Full-Time", "Part-Time", "Contract", "Intern"] as const;
export const EMPLOYMENT_STATUSES = ["Active", "On Leave", "Terminated"] as const;

export type Department       = (typeof DEPARTMENTS)[number];
export type EmploymentType   = (typeof EMPLOYMENT_TYPES)[number];
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IEmployee extends Document {
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string;
  designation:      string;
  department:       Department;
  employmentType:   EmploymentType;
  employmentStatus: EmploymentStatus;
  startDate:        Date;
  address: {
    street:     string;
    city:       string;
    state:      string;
    postalCode: string;
    country:    string;
  };
  avatarUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const EmployeeSchema = new Schema<IEmployee>(
  {
    firstName:        { type: String, required: true, trim: true, maxlength: 100 },
    lastName:         { type: String, required: true, trim: true, maxlength: 100 },
    email:            { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    phone:            { type: String, trim: true, maxlength: 30, default: "" },
    designation:      { type: String, required: true, trim: true, maxlength: 150 },
    department:       { type: String, required: true, enum: DEPARTMENTS },
    employmentType:   { type: String, required: true, enum: EMPLOYMENT_TYPES },
    employmentStatus: { type: String, required: true, enum: EMPLOYMENT_STATUSES, default: "Active" },
    startDate:        { type: Date, required: true },
    address:          { type: AddressSchema, required: true },
    avatarUrl:        { type: String, default: "" },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
    versionKey: false,
  }
);

// Indexes for common query patterns
EmployeeSchema.index({ email: 1 },                   { unique: true });
EmployeeSchema.index({ department: 1 });
EmployeeSchema.index({ employmentStatus: 1 });
EmployeeSchema.index({ lastName: 1, firstName: 1 });
// Full-text search across name, email, designation
EmployeeSchema.index(
  { firstName: "text", lastName: "text", email: "text", designation: "text" },
  { name: "employee_text_search" }
);

export const Employee = model<IEmployee>("Employee", EmployeeSchema);
