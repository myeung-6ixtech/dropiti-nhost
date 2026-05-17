import type { Request, Response } from "express";
import { requireAdminRole } from "../../_lib/auth";
import { hasuraQuery } from "../../_lib/hasura";
import { ok, fail } from "../../_lib/respond";

const PLATFORM_SUMMARY = `
  query PlatformSummary {
    users: real_estate_user_aggregate {
      aggregate {
        count
      }
    }
    properties: real_estate_property_listing_aggregate {
      aggregate {
        count
      }
    }
    offers: real_estate_offer_aggregate(where: { is_active: { _eq: true } }) {
      aggregate {
        count
      }
    }
  }
`;

/**
 * GET /v1/admin/reports/summary
 */
export default async function summary(req: Request, res: Response): Promise<void> {
  try {
    const payload = await requireAdminRole(req, res);
    if (!payload) return;

    const result = await hasuraQuery<{
      users?: { aggregate?: { count?: number } };
      properties?: { aggregate?: { count?: number } };
      offers?: { aggregate?: { count?: number } };
    }>(PLATFORM_SUMMARY);

    if (result.errors?.length) {
      fail(res, "Failed to load platform summary", 500);
      return;
    }

    ok(res, {
      userCount: result.data?.users?.aggregate?.count ?? 0,
      propertyCount: result.data?.properties?.aggregate?.count ?? 0,
      activeOfferCount: result.data?.offers?.aggregate?.count ?? 0,
    });
  } catch (error) {
    console.error("[admin/reports/summary]", error);
    fail(res, "Failed to load platform summary", 500);
  }
}
