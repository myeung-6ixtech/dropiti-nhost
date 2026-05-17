import type { Request, Response } from "express";
import { handleAdminGetUser } from "../../_lib/admin-handlers/users";
import { requireRestId } from "../../_lib/rest-route";
import { fail } from "../../_lib/respond";

/** GET /v1/admin/users/:userId */
export default async function adminUserById(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireRestId(req, res, {
      paramName: "userId",
      queryKey: "userId",
      pathPrefix: ["admin", "users"],
    });
    if (!userId) return;
    await handleAdminGetUser(req, res, userId);
  } catch (e) {
    console.error("[admin/users/[userId]]", e);
    fail(res, "Internal server error", 500);
  }
}
