import { z } from "zod";
import { DEPARTMENTS, EMPLOYMENT_TYPES, EMPLOYMENT_STATUSES } from "../models/Employee";

const AddressSchema = z.object({
  street:     z.string().min(1).max(200).trim(),
  city:       z.string().min(1).max(100).trim(),
  state:      z.string().max(100).trim().optional().default(""),
  postalCode: z.string().max(20).trim().optional().default(""),
  country:    z.string().min(1).max(100).trim(),
});

export const CreateEmployeeSchema = z.object({
  firstName:        z.string().min(1).max(100).trim(),
  lastName:         z.string().min(1).max(100).trim(),
  email:            z.string().email().max(254).toLowerCase().trim(),
  phone:            z.string().max(30).trim().optional().default(""),
  designation:      z.string().min(1).max(150).trim(),
  department:       z.enum(DEPARTMENTS),
  employmentType:   z.enum(EMPLOYMENT_TYPES),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).default("Active"),
  startDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  address:          AddressSchema,
  avatarUrl:        z.union([z.string().url(), z.literal("")]).optional().default(""),
});

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
