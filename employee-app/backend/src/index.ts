import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { config } from "./config/env";
import { employeeRouter } from "./routes/employees";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    },
  });
});

app.use("/api/employees", employeeRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
});

// Global error handler (must be last)
app.use(errorHandler);

// ── MongoDB connection + server start ─────────────────────────────────────────
async function start(): Promise<void> {
  try {
    console.log("[DB] Connecting to MongoDB...");
    await mongoose.connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });
    console.log("[DB] Connected to MongoDB");

    app.listen(config.PORT, () => {
      console.log(`[API] Employee API listening on port ${config.PORT}`);
      console.log(`[API] Health: http://localhost:${config.PORT}/api/health`);
    });
  } catch (err) {
    console.error("[DB] Connection failed:", err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[API] SIGTERM received — shutting down");
  await mongoose.disconnect();
  process.exit(0);
});

void start();
