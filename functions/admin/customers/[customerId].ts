import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

/** GET/PUT/DELETE /v1/admin/customers/:customerId */
export default async function customerById(req: Request, res: Response): Promise<void> {
  const id = airwallexResourceId(req, {
    paramName: "customerId",
    queryKey: "id",
    pathPrefix: ["admin", "customers"],
  });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }

  if (req.method === "GET") {
    await withAdminAirwallex(req, res, {
      tag: "admin/customers/[customerId]",
      rateKey: "airwallex:customers",
      handler: async () => airwallex.customers.get(id),
    });
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    await withAdminAirwallex(req, res, {
      tag: "admin/customers/[customerId]",
      rateKey: "airwallex:customers",
      handler: async () =>
        airwallex.customers.update(
          id,
          typeof req.body === "object" && req.body !== null
            ? (req.body as Record<string, unknown>)
            : {}
        ),
    });
    return;
  }

  if (req.method === "DELETE") {
    await withAdminAirwallex(req, res, {
      tag: "admin/customers/[customerId]",
      rateKey: "airwallex:customers",
      handler: async () => airwallex.customers.remove(id),
    });
    return;
  }

  fail(res, "Method not allowed", 405);
}
