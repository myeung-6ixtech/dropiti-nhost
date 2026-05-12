import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecretKey } from "./env";
import { fail } from "./respond";

export type VerifiedJwtPayload = jwt.JwtPayload;

/**
 * Verify `Authorization: Bearer <access_token>` with the project HS256 secret.
 */
export function requireAuth(
  req: Request,
  res: Response
): Promise<VerifiedJwtPayload | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    fail(res, "Unauthorized", 401);
    return Promise.resolve(null);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    fail(res, "Unauthorized", 401);
    return Promise.resolve(null);
  }

  const secret = getJwtSecretKey();
  if (!secret) {
    console.error("[auth] JWT secret not configured");
    fail(res, "Internal server error", 500);
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    jwt.verify(token, secret, { algorithms: ["HS256"] }, (err, decoded) => {
      if (err || decoded === undefined || typeof decoded !== "object") {
        fail(res, "Unauthorized", 401);
        resolve(null);
        return;
      }
      resolve(decoded as VerifiedJwtPayload);
    });
  });
}

/** Nhost user id — same as `auth.users.id` / JWT `sub`. */
export function getUserId(payload: VerifiedJwtPayload): string | undefined {
  const sub = payload.sub;
  return typeof sub === "string" ? sub : undefined;
}
