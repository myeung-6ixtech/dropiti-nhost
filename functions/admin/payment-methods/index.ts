import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, queryString } from "../../_lib/admin-airwallex-handler";

export default async function paymentMethodsIndex(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const customerId = queryString(req, "customer_id");
  const paymentMethodId = queryString(req, "payment_method_id");
  if (!customerId && !paymentMethodId) {
    fail(res, "customer_id or payment_method_id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/payment-methods/index",
    rateKey: "airwallex:payment-methods",
    handler: async () =>
      airwallex.paymentMethods.list({ customerId, paymentMethodId }),
  });
}
