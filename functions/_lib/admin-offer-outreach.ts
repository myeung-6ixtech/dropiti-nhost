export interface AdminOfferOutreachInput {
  propertyTitle?: string;
  rentalPrice?: number | null;
  rentalPriceCurrency?: string | null;
  initiatorName?: string | null;
  offerStatus?: string | null;
}

/** Build wa.me deep link with a pre-filled offer summary for admin outreach. */
export function buildAdminOfferWhatsAppUrl(
  externalContact: string,
  offer: AdminOfferOutreachInput
): string | null {
  const digits = externalContact.replace(/\D/g, "");
  if (!digits) return null;

  const parts: string[] = ["Hi, I have a rental enquiry on Dropiti for your listing."];
  if (offer.propertyTitle) parts.push(`Property: ${offer.propertyTitle}`);
  if (offer.rentalPrice != null) {
    const cur = offer.rentalPriceCurrency ?? "";
    parts.push(`Rent: ${cur} ${offer.rentalPrice}`.trim());
  }
  if (offer.initiatorName) parts.push(`Tenant: ${offer.initiatorName}`);
  if (offer.offerStatus) parts.push(`Offer status: ${offer.offerStatus}`);

  const text = encodeURIComponent(parts.join("\n"));
  return `https://wa.me/${digits}?text=${text}`;
}

/** Phase 2 placeholder — Facebook Messenger deep link. */
export function buildAdminOfferFacebookUrl(pageId: string | null | undefined): string | null {
  if (!pageId?.trim()) return null;
  return `https://m.me/${pageId.trim()}`;
}
