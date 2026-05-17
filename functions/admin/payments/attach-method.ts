import type { Request, Response } from "express";
import { z } from "zod";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex } from "../../_lib/admin-airwallex-handler";
import { validateBody } from "../../_lib/validate";

const Schema = z.object({
  payment_intent_id: z.string().min(1),
  payment_method_id: z.string().min(1),
  admin_override: z.boolean().optional(),
});

export default async function attachPaymentMethod(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    fail(res, "Method not allowed", 405);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/payments/attach-method",
    rateKey: "airwallex:payments",
    handler: async () => {
      const parsed = Schema.safeParse(req.body);
      if (!parsed.success) {
        throw new Error("payment_intent_id and payment_method_id are required");
      }
      const result = await airwallex.payments.attachMethod(
        parsed.data.payment_intent_id,
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
