import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

/** Legacy: GET /v1/admin/customers/get-customer?id= */
export default async function getCustomer(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET") {
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
    tag: "admin/customers/get-customer",
    rateKey: "airwallex:customers",
    handler: async () => airwallex.customers.get(id),
  });
}
