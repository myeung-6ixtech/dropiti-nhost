import type { Request, Response } from "express";
import { handleGetAdministratorUser } from "../../_lib/admin-handlers/administrator-users";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** Legacy: GET /v1/admin/administrator-users/get?id= */
export default async function getAdministratorUser(req: Request, res: Response): Promise<void> {
  try {
    const id = requireRestId(req, res, {
      queryKey: "id",
      pathPrefix: ["admin", "administrator-users"],
    });
    if (!id) return;
    await handleGetAdministratorUser(req, res, id);
  } catch (e) {
    console.error("[admin/administrator-users/get]", e);
    fail(res, "Internal server error", 500);
  }
}
