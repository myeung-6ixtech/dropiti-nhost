import type { Request, Response } from "express";
import {
  handleAdminGetProperty,
  handleAdminUpdateProperty,
} from "../../_lib/admin-handlers/properties";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/**
 * GET /v1/admin/properties/:propertyUuid
 * PUT /v1/admin/properties/:propertyUuid
 */
export default async function adminPropertyByUuid(req: Request, res: Response): Promise<void> {
  try {
    const propertyUuid = requireRestId(req, res, {
      paramName: "propertyUuid",
      queryKey: "propertyUuid",
      pathPrefix: ["admin", "properties"],
    });
    if (!propertyUuid) return;

    if (req.method === "GET") {
      await handleAdminGetProperty(req, res, propertyUuid);
      return;
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      await handleAdminUpdateProperty(req, res, propertyUuid);
      return;
    }
    fail(res, "Method not allowed", 405);
  } catch (e) {
    console.error("[admin/properties/[propertyUuid]]", e);
    fail(res, "Internal server error", 500);
  }
}
