import type { Request, Response } from "express";
import { z } from "zod";
import { requireAuth, getUserId } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { assertOrganiser, getGroupById } from "../../_lib/groups-core";
import { toDatabasePaymentFrequency } from "../../_lib/payment-frequency";
import { validateBody } from "../../_lib/validate";
import { ok, fail } from "../../_lib/respond";

const CreateOfferSchema = z.object({
  propertyId: z.string().uuid(),
  recipientUserId: z.string().uuid(),
  proposingRentPrice: z.number().positive(),
  numLeasingMonths: z.number().int().positive(),
  paymentFrequency: z.string(),
  moveInDate: z.string(),
  currency: z.string().optional(),
  groupId: z.string().uuid().optional(),
});

const CHECK_EXISTING_BY_INITIATOR = `
  query CheckExistingOfferByInitiator($propertyUuid: uuid!, $initiatorUserId: String!) {
    real_estate_offer(
      where: {
        property_uuid: { _eq: $propertyUuid }
        initiator_user_id: { _eq: $initiatorUserId }
        offer_status: { _in: ["pending", "accepted"] }
        is_active: { _eq: true }
      }
      limit: 1
    ) {
      id
      offer_status
    }
  }
`;

const CHECK_EXISTING_BY_GROUP = `
  query CheckExistingOfferByGroup($propertyUuid: uuid!, $groupId: uuid!) {
    real_estate_offer(
      where: {
        property_uuid: { _eq: $propertyUuid }
        group_id: { _eq: $groupId }
        offer_status: { _in: ["pending", "accepted"] }
        is_active: { _eq: true }
      }
      limit: 1
    ) {
      id
      offer_status
    }
  }
`;

const CREATE_OFFER = `
  mutation CreateOffer($offer: real_estate_offer_insert_input!) {
    insert_real_estate_offer_one(object: $offer) {
      id
      offer_key
      property_uuid
      group_id
      offer_status
      created_at
    }
  }
`;

export default async function createOffer(req: Request, res: Response): Promise<void> {
  try {
    if (req.method !== "POST") {
      fail(res, "Method not allowed", 405);
      return;
    }

    const payload = await requireAuth(req, res);
    if (!payload) return;

    const initiatorUserId = getUserId(payload);
    if (!initiatorUserId) {
      fail(res, "Invalid session", 401);
      return;
    }

    const body = validateBody(req, res, CreateOfferSchema);
    if (!body) return;

    const existingByInitiator = await hasuraQuery<{ real_estate_offer?: Array<{ id: number }> }>(
      CHECK_EXISTING_BY_INITIATOR,
      { propertyUuid: body.propertyId, initiatorUserId }
    );
    if (existingByInitiator.data?.real_estate_offer?.length) {
      fail(res, "Active offer already exists for this property", 409);
      return;
    }

    if (body.groupId) {
      const group = await getGroupById(body.groupId);
      if (!group) {
        fail(res, "Group not found", 404);
        return;
      }

      if (!assertOrganiser(group, initiatorUserId)) {
        fail(res, "Only the group organiser can submit offers on behalf of the group", 403);
        return;
      }

      if (group.status === "locked" || group.status === "disbanded") {
        fail(res, "This group cannot submit offers", 409);
        return;
      }

      const existingByGroup = await hasuraQuery<{ real_estate_offer?: Array<{ id: number }> }>(
        CHECK_EXISTING_BY_GROUP,
        { propertyUuid: body.propertyId, groupId: body.groupId }
      );
      if (existingByGroup.data?.real_estate_offer?.length) {
        fail(res, "Active group offer already exists for this property", 409);
        return;
      }
    }

    const offerKey = `offer_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const offer = {
      offer_key: offerKey,
      property_uuid: body.propertyId,
      group_id: body.groupId ?? null,
      initiator_user_id: initiatorUserId,
      recipient_user_id: body.recipientUserId,
      proposing_rent_price: body.proposingRentPrice,
      proposing_rent_price_currency: body.currency ?? "HKD",
      num_leasing_months: body.numLeasingMonths,
      payment_frequency: toDatabasePaymentFrequency(body.paymentFrequency),
      move_in_date: body.moveInDate,
      offer_status: "pending",
      is_active: true,
    };

    const created = await hasuraQuery<{ insert_real_estate_offer_one?: Record<string, unknown> }>(
      CREATE_OFFER,
      { offer }
    );

    if (created.errors?.length || !created.data?.insert_real_estate_offer_one) {
      fail(res, "Failed to create offer", 500);
      return;
    }

    ok(res, created.data.insert_real_estate_offer_one, 201);
  } catch (error) {
    console.error("[client/offers/create-offer]", error);
    fail(res, "Internal server error", 500);
  }
}
