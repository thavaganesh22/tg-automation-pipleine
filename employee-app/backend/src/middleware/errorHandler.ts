import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: err.errors.map((e) => ({
        field:   e.path.join("."),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error:   err.code,
      message: err.message,
    });
    return;
  }

  // Mongoose duplicate key
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  ) {
    res.status(409).json({
      error:   "DUPLICATE_EMAIL",
      message: "An employee with this email already exists",
    });
    return;
  }

  console.error("[UNHANDLED ERROR]", err);
  res.status(500).json({
    error:   "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
