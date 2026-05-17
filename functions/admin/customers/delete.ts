import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

export default async function deleteCustomer(req: Request, res: Response): Promise<void> {
  if (req.method !== "DELETE") {
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
    tag: "admin/customers/delete",
    rateKey: "airwallex:customers",
    handler: async () => airwallex.customers.remove(id),
  });
}
