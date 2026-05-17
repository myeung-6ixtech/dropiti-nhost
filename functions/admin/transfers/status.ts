import type { Request, Response } from "express";
import { fail } from "../../_lib/respond";
import { airwallex } from "../../_lib/airwallex";
import { withAdminAirwallex, queryString } from "../../_lib/admin-airwallex-handler";

export default async function airwallexTransferStatus(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const id = queryString(req, "id");
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/transfers/status",
    rateKey: "airwallex:transfers",
    handler: async () => airwallex.transfers.getStatus(id),
  });
}
