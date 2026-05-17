import type { Request, Response } from "express";
import { requireAdminRole, getUserId } from "./auth";
import { isAllowed } from "./ratelimit";
import { ok, fail } from "./respond";
import { AirwallexError } from "./airwallex";
import { isAirwallexStubMode } from "./airwallex";
import { restResourceId } from "./rest-route";

export async function withAdminAirwallex(
  req: Request,
  res: Response,
  opts: {
    tag: string;
    rateKey: string;
    maxPerWindow?: number;
    windowS?: number;
    handler: () => Promise<unknown>;
  }
): Promise<void> {
  try {
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const adminId = getUserId(payload) ?? "unknown";
    const allowed = await isAllowed(
      `${opts.rateKey}:${adminId}`,
      opts.maxPerWindow ?? 30,
      opts.windowS ?? 60
    );
    if (!allowed) {
      fail(res, "Rate limit exceeded", 429);
      return;
    }

    const data = await opts.handler();
    ok(res, {
      ...(typeof data === "object" && data !== null ? data : { data }),
      stub: isAirwallexStubMode(),
    });
  } catch (err) {
    if (err instanceof AirwallexError) {
      fail(res, err.message, err.statusCode);
      return;
    }
    console.error(`[${opts.tag}]`, err);
    fail(res, "Internal server error", 500);
  }
}

export function queryString(req: Request, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Airwallex resource id from path or legacy query. */
export function airwallexResourceId(
  req: Request,
  opts: { queryKey?: string; pathPrefix: string[]; paramName?: string }
): string | undefined {
  return (
    restResourceId(req, {
      paramName: opts.paramName,
      queryKey: opts.queryKey,
      pathPrefix: opts.pathPrefix,
    }) ?? undefined
  );
}
