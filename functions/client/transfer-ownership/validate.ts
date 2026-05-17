import type { Request, Response } from "express";
import { z } from "zod";
import { hasuraQuery } from "../../_lib/hasura";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";
import {
  extractLocation,
  GET_INVITATION_BY_TOKEN,
  persistExpiredIfNeeded,
  type InvitationStatus,
} from "../../_lib/transfer-ownership";

const PostValidateSchema = z.object({
  token: z.string().uuid(),
});

function sanitisedProperty(prop: {
  property_uuid: string;
  title: string;
  address: unknown;
  rental_price: number;
  rental_price_currency: string;
  property_type: string;
  num_bedroom: number;
  num_bathroom: number;
  display_image: string | null;
}) {
  return {
    propertyUuid: prop.property_uuid,
    title: prop.title,
    location: extractLocation(prop.address),
    rentalPrice: prop.rental_price,
    rentalPriceCurrency: prop.rental_price_currency,
    propertyType: prop.property_type,
    bedrooms: prop.num_bedroom,
    bathrooms: prop.num_bathroom,
    imageUrl: prop.display_image ?? null,
  };
}

async function validateToken(token: string): Promise<{
  status: InvitationStatus;
  property: ReturnType<typeof sanitisedProperty> | null;
  expiresAt: string | null;
  tokenUuid: string | null;
}> {
  const result = await hasuraQuery<{
    real_estate_property_transfer_invitation?: Array<{
      id: number;
      token_uuid: string;
      status: string;
      expires_at: string;
      property_listing?: {
        property_uuid: string;
        title: string;
        address: unknown;
        rental_price: number;
        rental_price_currency: string;
        property_type: string;
        num_bedroom: number;
        num_bathroom: number;
        display_image: string | null;
      } | null;
    }>;
  }>(GET_INVITATION_BY_TOKEN, { tokenUuid: token });

  const invitation = result.data?.real_estate_property_transfer_invitation?.[0];
  if (!invitation) {
    return { status: "invalid", property: null, expiresAt: null, tokenUuid: null };
  }

  const resolvedStatus = await persistExpiredIfNeeded(
    invitation.id,
    invitation.status,
    invitation.expires_at
  );

  const prop = invitation.property_listing;
  const property = prop ? sanitisedProperty(prop) : null;

  return {
    status: resolvedStatus,
    property,
    expiresAt: invitation.expires_at,
    tokenUuid: invitation.token_uuid,
  };
}

export default async function validateTransfer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === "GET") {
      const token =
        typeof req.query.token === "string" ? req.query.token.trim() : "";
      if (!token) {
        fail(res, "token is required", 400);
        return;
      }

      const payload = await validateToken(token);
      ok(res, payload);
      return;
    }

    if (req.method === "POST") {
      const body = validateBody(req, res, PostValidateSchema);
      if (!body) return;
      const payload = await validateToken(body.token);
      ok(res, payload);
      return;
    }

    fail(res, "Method not allowed", 405);
  } catch (error) {
    console.error("[client/transfer-ownership/validate]", error);
    fail(res, "Internal server error", 500);
  }
}
