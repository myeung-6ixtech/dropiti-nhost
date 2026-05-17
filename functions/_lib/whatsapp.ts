import {
  getWhatsAppApiToken,
  getWhatsAppPhoneNumberId,
  getWhatsAppProvider,
} from "./env";

export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const OWNERSHIP_TEMPLATE = "property_ownership_invitation";

async function sendViaMeta(
  to: string,
  templateName: string,
  params: Record<string, string>
): Promise<WhatsAppResult> {
  const token = getWhatsAppApiToken();
  const phoneId = getWhatsAppPhoneNumberId();
  if (!token || !phoneId) {
    return { success: false, error: "WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured" };
  }

  const components = Object.values(params).map((text) => ({
    type: "text",
    text,
  }));

  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [{ type: "body", parameters: components }],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text || `Meta API ${res.status}` };
  }

  const json = (await res.json()) as { messages?: Array<{ id?: string }> };
  return {
    success: true,
    messageId: json.messages?.[0]?.id,
  };
}

async function sendViaStub(
  to: string,
  templateName: string,
  params: Record<string, string>
): Promise<WhatsAppResult> {
  const messageId = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log("[whatsapp stub] sendMessage", { to, templateName, params, messageId });
  return { success: true, messageId };
}

async function sendMessage(
  to: string,
  templateName: string,
  params: Record<string, string>
): Promise<WhatsAppResult> {
  const provider = getWhatsAppProvider();
  if (provider === "meta") {
    return sendViaMeta(to, templateName, params);
  }
  if (provider === "twilio") {
    return {
      success: false,
      error: "Twilio WhatsApp provider not implemented — use stub or meta",
    };
  }
  return sendViaStub(to, templateName, params);
}

export async function sendOwnershipInvitation(
  externalContact: string,
  params: {
    propertyTitle: string;
    invitationUrl: string;
    expiryDays: number;
  }
): Promise<WhatsAppResult> {
  const to = externalContact.replace(/\D/g, "");
  if (!to) {
    return { success: false, error: "Invalid external contact" };
  }

  return sendMessage(to, OWNERSHIP_TEMPLATE, {
    propertyTitle: params.propertyTitle,
    invitationUrl: params.invitationUrl,
    expiryDays: String(params.expiryDays),
  });
}
