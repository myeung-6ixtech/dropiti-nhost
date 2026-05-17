import type { Request, Response } from "express";
import { handleDeleteAdministratorUser } from "../../_lib/admin-handlers/administrator-users";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** Legacy: DELETE /v1/admin/administrator-users/delete?id= */
export default async function deleteAdministratorUser(req: Request, res: Response): Promise<void> {
  try {
    const id = requireRestId(req, res, {
      queryKey: "id",
      pathPrefix: ["admin", "administrator-users"],
    });
    if (!id) return;
    await handleDeleteAdministratorUser(req, res, id);
  } catch (e) {
    console.error("[admin/administrator-users/delete]", e);
    fail(res, "Internal server error", 500);
  }
}
