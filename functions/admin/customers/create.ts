import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex } from "../../_lib/admin-airwallex-handler";

export default async function createCustomer(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    fail(res, "Method not allowed", 405);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/customers/create",
    rateKey: "airwallex:customers",
    handler: async () =>
      airwallex.customers.create(
        typeof req.body === "object" && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {}
      ),
  });
}
