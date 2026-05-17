import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

export default async function updateCustomer(req: Request, res: Response): Promise<void> {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const id = airwallexResourceId(req, {
    queryKey: "id",
    pathPrefix: ["admin", "customers"],
  });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/customers/update",
    rateKey: "airwallex:customers",
    handler: async () =>
      airwallex.customers.update(
        id,
        typeof req.body === "object" && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {}
      ),
  });
}
