import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecretKey } from "./env";
import { fail } from "./respond";

export type VerifiedJwtPayload = jwt.JwtPayload;

const HASURA_CLAIMS_URL = "https://hasura.io/jwt/claims";

export interface HasuraJwtClaims {
  allowedRoles: string[];
  defaultRole: string;
  userId: string;
}

/** Extract Hasura JWT claims from a verified payload (mirrors admin-console `nhost.ts`). */
export function extractHasuraClaims(
  payload: VerifiedJwtPayload
): HasuraJwtClaims {
  const claims = payload[HASURA_CLAIMS_URL] as Record<string, unknown> | undefined;
  const roles = claims?.["x-hasura-allowed-roles"];
  return {
    allowedRoles: Array.isArray(roles)
      ? roles.filter((r): r is string => typeof r === "string")
      : [],
    defaultRole:
      typeof claims?.["x-hasura-default-role"] === "string"
        ? claims["x-hasura-default-role"]
        : "",
    userId:
      typeof claims?.["x-hasura-user-id"] === "string"
        ? claims["x-hasura-user-id"]
        : "",
  };
}

/** True if the JWT grants the given Hasura role. */
export function hasRole(payload: VerifiedJwtPayload, role: string): boolean {
  return extractHasuraClaims(payload).allowedRoles.includes(role);
}

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

/**
 * Requires a valid JWT and `"admin"` in `x-hasura-allowed-roles`.
 * Use on every `functions/admin/*` handler.
 */
export async function requireAdminRole(
  req: Request,
  res: Response
): Promise<VerifiedJwtPayload | null> {
  const payload = await requireAuth(req, res);
  if (!payload) return null;

  if (!hasRole(payload, "admin")) {
    fail(res, "Admin role required", 403);
    return null;
  }

  return payload;
}

/** Nhost user id — prefers Hasura claim, falls back to JWT `sub`. */
export function getUserId(payload: VerifiedJwtPayload): string | undefined {
  const { userId } = extractHasuraClaims(payload);
  if (userId) return userId;
  const sub = payload.sub;
  return typeof sub === "string" ? sub : undefined;
}
