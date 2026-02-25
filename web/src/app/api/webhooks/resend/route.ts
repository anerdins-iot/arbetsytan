import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getReceivedEmailContent } from "@/lib/email";
import { processInboundEmail } from "@/services/email-inbound";
import { updateEmailStatus } from "@/lib/email-log";

type ResendWebhookEvent =
  | { type: "email.received"; data: Record<string, unknown> }
  | { type: "email.delivered"; data: { email_id: string; [k: string]: unknown } }
  | { type: "email.bounced"; data: { email_id: string; bounce?: { message?: string }; [k: string]: unknown } }
  | { type: "email.failed"; data: { email_id: string; error?: string; [k: string]: unknown } };

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "RESEND_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const headersList = await headers();

  const svixId = headersList.get("svix-id");
  const svixTimestamp = headersList.get("svix-timestamp");
  const svixSignature = headersList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "MISSING_SVIX_HEADERS" }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendWebhookEvent;
  } catch (err) {
    console.error("[resend-webhook] signature verification failed", err);
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  try {
    switch (event.type) {
      case "email.received": {
        const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
        const enriched = { ...event, data: { ...event.data } } as Parameters<typeof processInboundEmail>[0];
        if (emailId) {
          const body = await getReceivedEmailContent(emailId);
          enriched.data.html = body.html ?? enriched.data.html;
          enriched.data.text = body.text ?? enriched.data.text;
        }
        await processInboundEmail(enriched);
        break;
      }
      case "email.delivered":
        if (event.data?.email_id) {
          await updateEmailStatus(event.data.email_id, "DELIVERED");
        }
        break;
      case "email.bounced":
        if (event.data?.email_id) {
          const message = event.data.bounce?.message;
          await updateEmailStatus(event.data.email_id, "BOUNCED", message);
        }
        break;
      case "email.failed":
        if (event.data?.email_id) {
          await updateEmailStatus(event.data.email_id, "FAILED", event.data.error);
        }
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[resend-webhook] handler failed", err);
    return NextResponse.json({ error: "WEBHOOK_HANDLER_FAILED" }, { status: 500 });
  }
}
