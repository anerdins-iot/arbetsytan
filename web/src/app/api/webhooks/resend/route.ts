import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { processInboundEmail } from "@/services/email-inbound";
import { updateEmailStatus } from "@/lib/email-log";

const RESEND_WEBHOOK_HEADER = "svix-signature";

type ResendWebhookEvent =
  | { type: "email.received"; data: Record<string, unknown> }
  | { type: "email.delivered"; data: { email_id: string; [k: string]: unknown } }
  | { type: "email.bounced"; data: { email_id: string; bounce?: { message?: string }; [k: string]: unknown } }
  | { type: "email.failed"; data: { email_id: string; error?: string; [k: string]: unknown } };

function verifyResendWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  // Svix-style: "v1,<hex>" (Resend webhooks may use Svix)
  const [version, sig] = signatureHeader.split(",").map((s) => s.trim());
  if (version !== "v1" || !sig) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}

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
  const signature = headersList.get(RESEND_WEBHOOK_HEADER);

  if (!verifyResendWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "email.received":
        await processInboundEmail(event as Parameters<typeof processInboundEmail>[0]);
        break;
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
