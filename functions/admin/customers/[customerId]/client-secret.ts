import type { Request, Response } from "express";
import { airwallex, isAirwallexStubMode } from "../../../_lib/airwallex";
import { requireAdminRole } from "../../../_lib/auth";
import { fail, ok } from "../../../_lib/respond";
import { airwallexResourceId } from "../../../_lib/admin-airwallex-handler";

/** POST /v1/admin/customers/:customerId/client-secret */
export default async function customerClientSecretById(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const id = airwallexResourceId(req, {
      paramName: "customerId",
      queryKey: "id",
      pathPrefix: ["admin", "customers"],
    });
    if (!id) {
      fail(res, "id is required", 400);
      return;
    }

    const customer = await airwallex.customers.get(id);
    const secret =
      customer && typeof customer === "object" && "client_secret" in customer
        ? (customer as { client_secret?: string }).client_secret
        : undefined;

    if (secret) {
      ok(res, { client_secret: secret, stub: isAirwallexStubMode() });
      return;
    }

    fail(
      res,
      "Client secret not available for this customer. Create a new customer or use Airwallex Elements onboarding.",
      400
    );
  } catch (e) {
    console.error("[admin/customers/[customerId]/client-secret]", e);
    fail(res, "Failed to load customer", 500);
  }
}
