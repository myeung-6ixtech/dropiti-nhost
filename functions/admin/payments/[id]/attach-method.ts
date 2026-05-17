import type { Request, Response } from "express";
import { z } from "zod";
import { airwallex } from "../../../_lib/airwallex";
import { fail } from "../../../_lib/respond";
import { withAdminAirwallex, airwallexResourceId } from "../../../_lib/admin-airwallex-handler";

const Schema = z.object({
  payment_intent_id: z.string().optional(),
  payment_method_id: z.string().min(1),
  admin_override: z.boolean().optional(),
});

/** POST /v1/admin/payments/:id/attach-method */
export default async function attachPaymentMethodById(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    fail(res, "Method not allowed", 405);
    return;
  }

  const paymentIntentId = airwallexResourceId(req, {
    paramName: "id",
    pathPrefix: ["admin", "payments"],
  });

  await withAdminAirwallex(req, res, {
    tag: "admin/payments/[id]/attach-method",
    rateKey: "airwallex:payments",
    handler: async () => {
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        throw new Error("payment_method_id is required");
      }
      const intentId = paymentIntentId ?? parsed.data.payment_intent_id;
      if (!intentId) {
        throw new Error("payment intent id is required");
      }
      const result = await airwallex.payments.attachMethod(
        intentId,
        parsed.data.payment_method_id,
        {
          admin_override: parsed.data.admin_override ?? false,
          attached_via: "admin_console",
          attachment_timestamp: new Date().toISOString(),
        }
      );
      return { success: true, payment_intent: result };
    },
  });
}
