import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

export default async function updateBeneficiary(req: Request, res: Response): Promise<void> {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const id = airwallexResourceId(req, {
    queryKey: "id",
    pathPrefix: ["admin", "beneficiaries"],
  });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/beneficiaries/update",
    rateKey: "airwallex:beneficiaries",
    handler: async () =>
      airwallex.beneficiaries.update(
        id,
        typeof req.body === "object" && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {}
      ),
  });
}
