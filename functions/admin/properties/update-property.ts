import type { Request, Response } from "express";
import { handleAdminUpdateProperty } from "../../_lib/admin-handlers/properties";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** Legacy: PUT /v1/admin/properties/update-property */
export default async function adminUpdateProperty(req: Request, res: Response): Promise<void> {
  try {
    const fromQuery = requireRestId(req, res, {
      queryKey: "propertyUuid",
      pathPrefix: ["admin", "properties"],
    });
    if (!fromQuery) return;

    const body = req.body as { propertyUuid?: string };
    const propertyUuid = body.propertyUuid ?? fromQuery;
    await handleAdminUpdateProperty(req, res, propertyUuid);
  } catch (e) {
    console.error("[admin/properties/update-property]", e);
    fail(res, "Internal server error", 500);
  }
}
