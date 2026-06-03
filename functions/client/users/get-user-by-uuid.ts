import type { Request, Response } from "express";
import { fail } from "../../_lib/respond";

/**
 * @deprecated Use GET /v1/client/users/get-user-by-id?nhost_user_id=<uuid> instead.
 * Profile URLs and client code should use Nhost auth user id (real_estate_user.nhost_user_id).
 */
export default async function getUserByUuid(req: Request, res: Response): Promise<void> {
  fail(
    res,
    "Deprecated: use GET /v1/client/users/get-user-by-id?nhost_user_id=<uuid>",
    410
  );
}
