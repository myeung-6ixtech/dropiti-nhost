import { getUpstashRedisToken, getUpstashRedisUrl, isUpstashConfigured } from "./env";

let loggedMissingUpstash = false;

/**
 * Sliding-window rate limit via Upstash REST API.
 * Returns true when the request is allowed, false when over limit.
 * If Upstash is not configured, always allows (dev-friendly).
 */
export async function isAllowed(
  key: string,
  max: number,
  windowS: number
): Promise<boolean> {
  if (!isUpstashConfigured()) {
    if (!loggedMissingUpstash) {
      loggedMissingUpstash = true;
      console.warn("[ratelimit] Upstash not configured — rate limits disabled");
    }
    return true;
  }

  const url = getUpstashRedisUrl()!;
  const token = getUpstashRedisToken()!;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowS, "NX"],
      ]),
    });

    if (!res.ok) {
      console.error("[ratelimit] Upstash pipeline failed", res.status);
      return true;
    }

    const data = (await res.json()) as Array<{ result?: number }>;
    const count = data[0]?.result ?? 0;
    return count <= max;
  } catch (err) {
    console.error("[ratelimit] Upstash error", err);
    return true;
  }
}
