import type { Request, Response } from "express";
import { airwallex } from "../../_lib/airwallex";
import { fail } from "../../_lib/respond";
import { withAdminAirwallex, queryString } from "../../_lib/admin-airwallex-handler";

export default async function paymentConsentsIndex(req: Request, res: Response): Promise<void> {
  if (req.method !== "GET") {
    fail(res, "Method not allowed", 405);
    return;
  }
  const customerId = queryString(req, "customer_id");
  const paymentConsentId = queryString(req, "payment_consent_id");
  if (!customerId && !paymentConsentId) {
    fail(res, "customer_id or payment_consent_id is required", 400);
    return;
  }
  await withAdminAirwallex(req, res, {
    tag: "admin/payment-consents/index",
    rateKey: "airwallex:payment-consents",
    handler: async () =>
      airwallex.paymentConsents.list({ customerId, paymentConsentId }),
  });
}
