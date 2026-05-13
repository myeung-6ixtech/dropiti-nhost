import type { Request, Response } from "express";
import { z } from "zod";
import { fail } from "./respond";

/**
 * Validate `req.body` with a Zod schema (POST / PUT / PATCH).
 * On failure, sends 422 and returns null.
 */
export function validateBody<S extends z.ZodType>(
  req: Request,
  res: Response,
  schema: S
): z.infer<S> | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, "Validation failed", 422, parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

/** Alias matching documentation/AI_Rules.md handler examples (`validate`). */
export const validate = validateBody;
