import {
  getAirwallexApiKey,
  getAirwallexClientId,
  getAirwallexEnv,
  isAirwallexConfigured,
  type AirwallexEnvName,
} from "./env";

const BASE_URLS: Record<AirwallexEnvName, string> = {
  demo: "https://api-demo.airwallex.com/api/v1",
  prod: "https://api.airwallex.com/api/v1",
};

export class AirwallexError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AirwallexError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function baseUrl(): string {
  return BASE_URLS[getAirwallexEnv()];
}

function stubMode(): boolean {
  return !isAirwallexConfigured();
}

async function getAirwallexToken(): Promise<string> {
  if (stubMode()) {
    return "stub_token";
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const clientId = getAirwallexClientId()!;
  const apiKey = getAirwallexApiKey()!;

  const res = await fetch(`${baseUrl()}/authentication/login`, {
    method: "POST",
    headers: {
      "x-client-id": clientId,
      "x-api-key": apiKey,
    },
  });

  if (!res.ok) {
    throw new AirwallexError("Airwallex auth failed", 502);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new AirwallexError("Airwallex auth failed", 502);
  }

  cachedToken = {
    value: data.token,
    expiresAt: Date.now() + 29 * 60 * 1000,
  };
  return cachedToken.value;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function airwallexRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (stubMode()) {
    return {} as T;
  }

  const token = await getAirwallexToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const clientId = getAirwallexClientId();
  const apiKey = getAirwallexApiKey();
  if (clientId) headers["x-client-id"] = clientId;
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }

  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "Airwallex request failed";
    const status = res.status >= 500 ? 502 : res.status === 401 ? 502 : 400;
    throw new AirwallexError(msg, status);
  }

  return body as T;
}

function stubList<T>(items: T[] = []): { items: T[]; has_more: boolean } {
  return { items, has_more: false };
}

export const airwallex = {
  payments: {
    async list(params: {
      status?: string;
      page?: string;
      limit?: string;
      dateFrom?: string;
      dateTo?: string;
    }) {
      if (stubMode()) {
        return stubList([
          {
            id: "pi_stub_001",
            status: "SUCCEEDED",
            amount: 1000,
            currency: "MYR",
            created_at: new Date().toISOString(),
          },
        ]);
      }
      const q = buildQuery({
        status: params.status,
        page_num: params.page,
        page_size: params.limit,
        from_created_at: params.dateFrom,
        to_created_at: params.dateTo,
      });
      return airwallexRequest<{ items?: unknown[]; has_more?: boolean }>(
        `/pa/payment_intents${q}`
      );
    },

    async get(id: string) {
      if (stubMode()) {
        return {
          id,
          status: "SUCCEEDED",
          amount: 1000,
          currency: "MYR",
          created_at: new Date().toISOString(),
        };
      }
      return airwallexRequest<Record<string, unknown>>(`/pa/payment_intents/${id}`);
    },

    async capture(id: string, captureAmount?: number) {
      if (stubMode()) {
        return { id, status: "SUCCEEDED", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(
        `/pa/payment_intents/${id}/capture`,
        {
          method: "POST",
          body: JSON.stringify(
            captureAmount !== undefined ? { amount: captureAmount } : {}
          ),
        }
      );
    },

    async cancel(id: string, cancellationReason?: string) {
      if (stubMode()) {
        return { id, status: "CANCELLED", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(
        `/pa/payment_intents/${id}/cancel`,
        {
          method: "POST",
          body: JSON.stringify(
            cancellationReason ? { cancellation_reason: cancellationReason } : {}
          ),
        }
      );
    },

    async update(id: string, body: Record<string, unknown>) {
      if (stubMode()) {
        return { id, stub: true, ...body };
      }
      const payload = {
        request_id: `update-${Date.now()}`,
        ...body,
      };
      try {
        return await airwallexRequest<Record<string, unknown>>(
          `/pa/payment_intents/${id}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
      } catch {
        return airwallexRequest<Record<string, unknown>>(
          `/pa/payment_intents/${id}/update`,
          { method: "POST", body: JSON.stringify(payload) }
        );
      }
    },

    async attachMethod(
      paymentIntentId: string,
      paymentMethodId: string,
      metadata?: Record<string, unknown>
    ) {
      if (stubMode()) {
        return { id: paymentIntentId, status: "REQUIRES_CAPTURE", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(
        `/pa/payment_intents/${paymentIntentId}/attach_payment_method`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: `attach-${Date.now()}`,
            payment_method_id: paymentMethodId,
            metadata,
          }),
        }
      );
    },
  },

  paymentMethods: {
    async list(params: { customerId?: string; paymentMethodId?: string }) {
      if (stubMode()) {
        return params.paymentMethodId
          ? { id: params.paymentMethodId, type: "card", stub: true }
          : stubList([{ id: "pm_stub_001", type: "card" }]);
      }
      if (params.paymentMethodId) {
        return airwallexRequest<Record<string, unknown>>(
          `/pa/payment_methods/${params.paymentMethodId}`
        );
      }
      const q = buildQuery({ customer_id: params.customerId });
      return airwallexRequest<unknown>(`/pa/payment_methods${q}`);
    },

    async create(body: Record<string, unknown>) {
      if (stubMode()) {
        return { id: `pm_stub_${Date.now()}`, stub: true };
      }
      return airwallexRequest<Record<string, unknown>>("/pa/payment_methods/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  paymentConsents: {
    async list(params: { customerId?: string; paymentConsentId?: string }) {
      if (stubMode()) {
        return params.paymentConsentId
          ? { id: params.paymentConsentId, status: "VERIFIED", stub: true }
          : stubList([{ id: "pc_stub_001", status: "VERIFIED" }]);
      }
      if (params.paymentConsentId) {
        return airwallexRequest<Record<string, unknown>>(
          `/pa/payment_consents/${params.paymentConsentId}`
        );
      }
      const q = buildQuery({ customer_id: params.customerId });
      return airwallexRequest<unknown>(`/pa/payment_consents${q}`);
    },

    async create(body: Record<string, unknown>) {
      if (stubMode()) {
        return { id: `pc_stub_${Date.now()}`, stub: true };
      }
      return airwallexRequest<Record<string, unknown>>("/pa/payment_consents/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  },

  paymentIntents: {
    async list(params: { status?: string; page?: string; limit?: string }) {
      if (stubMode()) {
        return stubList([
          {
            id: "pi_stub_001",
            status: "REQUIRES_PAYMENT_METHOD",
            amount: 500,
            currency: "MYR",
          },
        ]);
      }
      const q = buildQuery({
        status: params.status,
        page_num: params.page,
        page_size: params.limit,
      });
      return airwallexRequest<{ items?: unknown[] }>(`/pa/payment_intents${q}`);
    },

    async get(id: string) {
      return airwallex.payments.get(id);
    },
  },

  beneficiaries: {
    async list(params: { page?: string; limit?: string; search?: string }) {
      if (stubMode()) {
        return stubList([{ id: "ben_stub_001", nickname: "Stub Beneficiary" }]);
      }
      const q = buildQuery({
        page_num: params.page,
        page_size: params.limit,
        nickname: params.search,
      });
      return airwallexRequest<{ items?: unknown[] }>(`/beneficiaries${q}`);
    },

    async create(body: Record<string, unknown>) {
      if (stubMode()) {
        return { id: `ben_stub_${Date.now()}`, stub: true };
      }
      return airwallexRequest<Record<string, unknown>>("/beneficiaries/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async get(id: string) {
      if (stubMode()) {
        return { id, nickname: "Stub Beneficiary", beneficiary_id: id };
      }
      return airwallexRequest<Record<string, unknown>>(`/beneficiaries/${id}`);
    },

    async update(id: string, body: Record<string, unknown>) {
      if (stubMode()) {
        return { id, stub: true, ...body };
      }
      return airwallexRequest<Record<string, unknown>>(`/beneficiaries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    async remove(id: string) {
      if (stubMode()) {
        return { id, deleted: true, stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(`/beneficiaries/${id}/delete`, {
        method: "POST",
      });
    },
  },

  transfers: {
    async list(params: {
      status?: string;
      page?: string;
      limit?: string;
      dateFrom?: string;
    }) {
      if (stubMode()) {
        return stubList([
          {
            id: "tr_stub_001",
            status: "COMPLETED",
            amount: 250,
            currency: "MYR",
          },
        ]);
      }
      const q = buildQuery({
        status: params.status,
        page_num: params.page,
        page_size: params.limit,
        from_created_at: params.dateFrom,
      });
      return airwallexRequest<{ items?: unknown[] }>(`/transfers${q}`);
    },

    async create(body: {
      beneficiaryId: string;
      amount: number;
      currency: string;
      reference?: string;
    }) {
      if (stubMode()) {
        return { id: `tr_stub_${Date.now()}`, status: "NEW", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>("/transfers/create", {
        method: "POST",
        body: JSON.stringify({
          beneficiary_id: body.beneficiaryId,
          transfer_amount: body.amount,
          transfer_currency: body.currency,
          reference: body.reference,
          request_id: `dropiti_${Date.now()}`,
        }),
      });
    },

    async getStatus(id: string) {
      if (stubMode()) {
        return { id, status: "COMPLETED", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(`/transfers/${id}`);
    },

    async cancel(id: string) {
      if (stubMode()) {
        return { id, status: "CANCELLED", stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(`/transfers/${id}/cancel`, {
        method: "POST",
      });
    },
  },

  customers: {
    async list(params: { page?: string; limit?: string }) {
      if (stubMode()) {
        return stubList([
          {
            id: "cus_stub_001",
            merchant_customer_id: "merchant_001",
            first_name: "Stub",
            last_name: "Customer",
            email: "stub@dropiti.test",
            created_at: new Date().toISOString(),
          },
        ]);
      }
      const q = buildQuery({
        page_num: params.page,
        page_size: params.limit,
      });
      return airwallexRequest<{ items?: unknown[]; has_more?: boolean }>(
        `/pa/customers${q}`
      );
    },

    async get(id: string) {
      if (stubMode()) {
        return {
          id,
          merchant_customer_id: "merchant_001",
          first_name: "Stub",
          last_name: "Customer",
          email: "stub@dropiti.test",
        };
      }
      return airwallexRequest<Record<string, unknown>>(`/pa/customers/${id}`);
    },

    async create(body: Record<string, unknown>) {
      if (stubMode()) {
        return { id: `cus_stub_${Date.now()}`, stub: true, ...body };
      }
      return airwallexRequest<Record<string, unknown>>("/pa/customers/create", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async update(id: string, body: Record<string, unknown>) {
      if (stubMode()) {
        return { id, stub: true, ...body };
      }
      return airwallexRequest<Record<string, unknown>>(
        `/pa/customers/${id}/update`,
        { method: "POST", body: JSON.stringify(body) }
      );
    },

    async remove(id: string) {
      if (stubMode()) {
        return { id, deleted: true, stub: true };
      }
      return airwallexRequest<Record<string, unknown>>(`/pa/customers/${id}`, {
        method: "DELETE",
      });
    },
  },
};

export function isAirwallexStubMode(): boolean {
  return stubMode();
}
