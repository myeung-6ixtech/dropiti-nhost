import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

/** GET/PUT/DELETE /v1/admin/beneficiaries/:id */
export default async function beneficiaryById(req: Request, res: Response): Promise<void> {
  const id = airwallexResourceId(req, {
    paramName: "id",
    queryKey: "id",
    pathPrefix: ["admin", "beneficiaries"],
  });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }

  if (req.method === "GET") {
    await withAdminAirwallex(req, res, {
      tag: "admin/beneficiaries/[id]",
      rateKey: "airwallex:beneficiaries",
      handler: async () => airwallex.beneficiaries.get(id),
    });
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    await withAdminAirwallex(req, res, {
      tag: "admin/beneficiaries/[id]",
      rateKey: "airwallex:beneficiaries",
      handler: async () =>
        airwallex.beneficiaries.update(
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
      tag: "admin/beneficiaries/[id]",
      rateKey: "airwallex:beneficiaries",
      handler: async () => airwallex.beneficiaries.remove(id),
    });
    return;
  }

  fail(res, "Method not allowed", 405);
}
