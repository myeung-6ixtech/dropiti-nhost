import type { Request, Response } from "express";
import { pathIdAfter, resolveId } from "./path-params";
import { fail } from "./respond";

type ExpressParam = Record<string, string | undefined>;

/** ID from Express route param, path suffix, or legacy query. */
export function restResourceId(
  req: Request,
  opts: {
    paramName?: string;
    queryKey?: string;
    pathPrefix: string[];
  }
): string | null {
  const params = (req as Request & { params?: ExpressParam }).params;
  if (opts.paramName && params?.[opts.paramName]) {
    return decodeURIComponent(params[opts.paramName]!);
  }

  const fromPath = pathIdAfter(req, opts.pathPrefix);
  if (fromPath && !fromPath.startsWith("[")) return fromPath;

  if (opts.queryKey) {
    return resolveId(req, opts.queryKey, opts.pathPrefix);
  }

  return fromPath;
}

export function requireRestId(
  req: Request,
  res: Response,
  opts: Parameters<typeof restResourceId>[1]
): string | null {
  const id = restResourceId(req, opts);
  if (!id) {
    fail(res, "Resource id is required", 400);
    return null;
  }
  return id;
}
