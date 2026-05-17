import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, queryString } from "../../_lib/admin-airwallex-handler";

export default async function customersIndex(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/customers/index",
    rateKey: "airwallex:customers",
    handler: async () =>
      airwallex.customers.list({
        page: queryString(req, "page"),
        limit: queryString(req, "limit"),
      }),
  });
}
