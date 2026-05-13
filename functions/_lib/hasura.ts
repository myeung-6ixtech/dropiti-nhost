import { getGraphqlUrl, getHasuraAdminSecret } from "./env";

export interface HasuraResult<T> {
  data?: T;
  errors?: ReadonlyArray<{ message: string }>;
}

/**
 * Server-side Hasura GraphQL using the admin secret (from env helper).
 */
export async function hasuraQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<HasuraResult<T>> {
  const url = getGraphqlUrl();
  const adminSecret = getHasuraAdminSecret();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      errors: [{ message: `Hasura HTTP ${response.status}: ${text.slice(0, 200)}` }],
    };
  }

  const json = (await response.json()) as HasuraResult<T>;
  return json;
}
