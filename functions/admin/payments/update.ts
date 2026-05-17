import type { Request, Response } from "express";
import { z } from "zod";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

const Schema = z.object({
  descriptor: z.string().optional(),
  merchant_order_id: z.string().optional(),
  customer_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export default async function updatePayment(req: Request, res: Response): Promise<void> {
  if (req.method !== "PUT" && req.method !== "PATCH") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const id =
    airwallexResourceId(req, {
      queryKey: "id",
      pathPrefix: ["admin", "payment-intents"],
    }) ??
    airwallexResourceId(req, { queryKey: "id", pathPrefix: ["admin", "payments"] });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/payments/update",
    rateKey: "airwallex:payments",
    handler: async () => {
      const body = Schema.parse(req.body ?? {});
      const updates: Record<string, unknown> = {};
      if (body.descriptor) updates.descriptor = body.descriptor;
      if (body.merchant_order_id) updates.merchant_order_id = body.merchant_order_id;
      if (body.customer_id) updates.customer_id = body.customer_id;
      if (body.metadata) updates.metadata = body.metadata;
      return airwallex.payments.update(id, updates);
    },
  });
}
