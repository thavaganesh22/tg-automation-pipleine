import { createHash } from "crypto";

/**
 * Generates a deterministic UUID-shaped string from an arbitrary input string
 * using a SHA-1 hash. Identical inputs always produce the same ID, which keeps
 * test-case IDs stable across pipeline runs and machines.
 */
export function deterministicId(input: string): string {
  const h = createHash("sha1").update(input).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}