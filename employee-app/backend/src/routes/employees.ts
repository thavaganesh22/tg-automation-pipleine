import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Employee, DEPARTMENTS, EMPLOYMENT_STATUSES } from "../models/Employee";
import { CreateEmployeeSchema, UpdateEmployeeSchema } from "../middleware/validation";
import { AppError } from "../middleware/errorHandler";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && id.length === 24;
}

function assertValidId(id: string): void {
  if (!isValidObjectId(id)) {
    throw new AppError("INVALID_ID", `'${id}' is not a valid employee id`, 400);
  }
}

// ── GET /employees ────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const skip   = (page - 1) * limit;
    const search = String(req.query.search ?? "").trim();
    const dept   = String(req.query.department ?? "").trim();
    const status = String(req.query.status    ?? "").trim();

    // Build filter
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$text = { $search: search };
    }
    if (dept && DEPARTMENTS.includes(dept as typeof DEPARTMENTS[number])) {
      filter.department = dept;
    }
    if (status && EMPLOYMENT_STATUSES.includes(status as typeof EMPLOYMENT_STATUSES[number])) {
      filter.employmentStatus = status;
    }

    const [data, total] = await Promise.all([
      Employee.find(filter)
        .select("firstName lastName email designation department employmentStatus avatarUrl")
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Employee.countDocuments(filter),
    ]);

    res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /employees ───────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateEmployeeSchema.parse(req.body);
    const employee = await Employee.create(body);
    res.status(201).json(employee.toObject());
  } catch (err) {
    next(err);
  }
});

// ── GET /employees/:id ────────────────────────────────────────────────────────

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertValidId(req.params.id);
    const employee = await Employee.findById(req.params.id).lean();
    if (!employee) {
      throw new AppError("NOT_FOUND", `Employee with id ${req.params.id} not found`, 404);
    }
    res.json(employee);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /employees/:id ──────────────────────────────────────────────────────

router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertValidId(req.params.id);
    const body = UpdateEmployeeSchema.parse(req.body);

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      throw new AppError("NOT_FOUND", `Employee with id ${req.params.id} not found`, 404);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /employees/:id ─────────────────────────────────────────────────────

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertValidId(req.params.id);
    const result = await Employee.findByIdAndDelete(req.params.id);
    if (!result) {
      throw new AppError("NOT_FOUND", `Employee with id ${req.params.id} not found`, 404);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as employeeRouter };
