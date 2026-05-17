import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecretKey } from "./env";
import { fail } from "./respond";
import type { VerifiedJwtPayload } from "./auth";

/**
 * If no Bearer token: returns `null` (anonymous allowed).
 * If Bearer present: verifies JWT; on failure sends 401 and returns `null`.
 */
export function optionalAuth(
  req: Request,
  res: Response
): Promise<VerifiedJwtPayload | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return Promise.resolve(null);
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return Promise.resolve(null);
  }

  const secret = getJwtSecretKey();
  if (!secret) {
    console.error("[optional-auth] JWT secret not configured");
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
