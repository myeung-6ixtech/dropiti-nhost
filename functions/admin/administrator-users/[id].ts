import type { Request, Response } from "express";
import {
  handleDeleteAdministratorUser,
  handleGetAdministratorUser,
  handleUpdateAdministratorUser,
} from "../../_lib/admin-handlers/administrator-users";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** GET/PUT/DELETE /v1/admin/administrator-users/:id */
export default async function administratorUserById(req: Request, res: Response): Promise<void> {
  try {
    const id = requireRestId(req, res, {
      paramName: "id",
      queryKey: "id",
      pathPrefix: ["admin", "administrator-users"],
    });
    if (!id) return;

    if (req.method === "GET") {
      await handleGetAdministratorUser(req, res, id);
      return;
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      await handleUpdateAdministratorUser(req, res, id);
      return;
    }
    if (req.method === "DELETE") {
      await handleDeleteAdministratorUser(req, res, id);
      return;
    }
    fail(res, "Method not allowed", 405);
  } catch (e) {
    console.error("[admin/administrator-users/[id]]", e);
    fail(res, "Internal server error", 500);
  }
}
