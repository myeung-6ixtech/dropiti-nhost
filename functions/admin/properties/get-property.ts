import type { Request, Response } from "express";
import { handleAdminGetProperty } from "../../_lib/admin-handlers/properties";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** Legacy: GET /v1/admin/properties/get-property?propertyUuid= */
export default async function adminGetProperty(req: Request, res: Response): Promise<void> {
  try {
    const propertyUuid = requireRestId(req, res, {
      queryKey: "propertyUuid",
      pathPrefix: ["admin", "properties"],
    });
    if (!propertyUuid) return;
    await handleAdminGetProperty(req, res, propertyUuid);
  } catch (e) {
    console.error("[admin/properties/get-property]", e);
    fail(res, "Internal server error", 500);
  }
}
