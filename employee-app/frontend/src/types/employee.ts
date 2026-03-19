export type Department =
  | "Engineering" | "Product" | "Design" | "QA" | "DevOps"
  | "Data" | "Marketing" | "Sales" | "HR" | "Finance"
  | "Legal" | "Operations" | "Other";

export type EmploymentType   = "Full-Time" | "Part-Time" | "Contract" | "Intern";
export type EmploymentStatus = "Active" | "On Leave" | "Terminated";

export interface Address {
  street:     string;
  city:       string;
  state:      string;
  postalCode: string;
  country:    string;
}

export interface Employee {
  _id:              string;
  firstName:        string;
  lastName:         string;
  email:            string;
  phone:            string;
  cellPhone:        string;
  designation:      string;
  department:       Department;
  employmentType:   EmploymentType;
  employmentStatus: EmploymentStatus;
  startDate:        string;   // ISO date string
  address:          Address;
  avatarUrl:        string;
  createdAt:        string;
  updatedAt:        string;
}

export interface EmployeeListItem {
  _id:              string;
  firstName:        string;
  lastName:         string;
  email:            string;
  designation:      string;
  department:       Department;
  employmentStatus: EmploymentStatus;
  avatarUrl:        string;
}

export interface Pagination {
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export interface ListResponse {
  data:       EmployeeListItem[];
  pagination: Pagination;
}

export type CreateEmployeeInput = Omit<Employee,
  "_id" | "createdAt" | "updatedAt" | "avatarUrl"
> & { avatarUrl?: string };

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export const DEPARTMENTS: Department[] = [
  "Engineering", "Product", "Design", "QA", "DevOps",
  "Data", "Marketing", "Sales", "HR", "Finance", "Legal", "Operations", "Other",
];

export const EMPLOYMENT_TYPES: EmploymentType[]   = ["Full-Time", "Part-Time", "Contract", "Intern"];
export const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["Active", "On Leave", "Terminated"];
