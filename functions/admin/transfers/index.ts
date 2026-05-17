import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, queryString } from "../../_lib/admin-airwallex-handler";

/** Airwallex fund transfers (not property transfer-ownership). */
export default async function airwallexTransfersIndex(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/transfers/index",
    rateKey: "airwallex:transfers",
    handler: async () =>
      airwallex.transfers.list({
        status: queryString(req, "status"),
        page: queryString(req, "page"),
        limit: queryString(req, "limit"),
        dateFrom: queryString(req, "dateFrom"),
      }),
  });
}
