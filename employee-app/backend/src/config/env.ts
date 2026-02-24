import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.string().default("4000").transform(Number),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[CONFIG] Invalid environment variables:");
  parsed.error.errors.forEach((e) =>
    console.error(`  ${e.path.join(".")}: ${e.message}`)
  );
  process.exit(1);
}

export const config = parsed.data;
