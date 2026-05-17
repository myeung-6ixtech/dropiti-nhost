import type { Request, Response } from "express";
import { handleUpdateAdministratorUser } from "../../_lib/admin-handlers/administrator-users";
import { fail } from "../../_lib/respond";

/** Legacy: PUT /v1/admin/administrator-users/update */
export default async function updateAdministratorUser(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { id?: string };
    const id =
      body.id ??
      (typeof req.query.id === "string" ? req.query.id.trim() : null) ??
      null;
    if (!id) {
      fail(res, "id is required", 400);
      return;
    }
    await handleUpdateAdministratorUser(req, res, id);
  } catch (e) {
    console.error("[admin/administrator-users/update]", e);
    fail(res, "Internal server error", 500);
  }
}
