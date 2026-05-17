import type { Request, Response } from "express";
import { z } from "zod";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../_lib/admin-airwallex-handler";

const UpdateSchema = z.object({
  descriptor: z.string().optional(),
  merchant_order_id: z.string().optional(),
  customer_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** GET/PUT /v1/admin/payment-intents/:id */
export default async function paymentIntentById(req: Request, res: Response): Promise<void> {
  const id = airwallexResourceId(req, {
    paramName: "id",
    queryKey: "id",
    pathPrefix: ["admin", "payment-intents"],
  });
  if (!id) {
    fail(res, "id is required", 400);
    return;
  }

  if (req.method === "GET") {
    await withAdminAirwallex(req, res, {
      tag: "admin/payment-intents/[id]",
      rateKey: "airwallex:payment-intents",
      handler: async () => airwallex.paymentIntents.get(id),
    });
    return;
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    await withAdminAirwallex(req, res, {
      tag: "admin/payment-intents/[id]",
      rateKey: "airwallex:payments",
      handler: async () => {
        const body = UpdateSchema.parse(req.body ?? {});
        const updates: Record<string, unknown> = {};
        if (body.descriptor) updates.descriptor = body.descriptor;
        if (body.merchant_order_id) updates.merchant_order_id = body.merchant_order_id;
        if (body.customer_id) updates.customer_id = body.customer_id;
        if (body.metadata) updates.metadata = body.metadata;
        return airwallex.payments.update(id, updates);
      },
    });
    return;
  }

  fail(res, "Method not allowed", 405);
}
