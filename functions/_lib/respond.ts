import type { Response } from "express";

export type OkEnvelope<T> = { ok: true; data: T };
export type FailEnvelope = { ok: false; error: string; details?: unknown };

export function ok<T>(res: Response, data: T, status = 200): void {
  const body: OkEnvelope<T> = { ok: true, data };
  res.status(status).json(body);
}

export function fail(
  res: Response,
  message: string,
  status: number,
  details?: unknown
): void {
  const body: FailEnvelope = { ok: false, error: message };
  if (details !== undefined) {
    body.details = details;
  }
  res.status(status).json(body);
}
