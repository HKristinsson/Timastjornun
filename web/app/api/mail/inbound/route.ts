import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sanitizeHtml from "sanitize-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// Mailgun inbound webhook.
// Beiningarregla:
//   - Móttakandi í group2_recipients (virkur)  -> vista í innhólf appsins.
//   - Annars -> EKKI vista; í framleiðslu beinir Mailgun Route/M365 póstinum
//     til hóps 1 (sjá MAILGATEWAY.md). Óþekkt netfang -> póstveitan bouncar.
// =============================================================================

function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return false;
  const digest = createHmac("sha256", key).update(timestamp + token).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

function clean(html: string | null): string | null {
  if (!html) return null;
  // Öryggishreinsun ÁÐUR en vistað: ekkert script/style/iframe/event handlers.
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
      a: ["href", "name", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Vantar SUPABASE_SERVICE_ROLE_KEY í umhverfi" },
      { status: 503 }
    );
  }

  // Mailgun sendir multipart/form-data eða x-www-form-urlencoded
  const form = await request.formData();
  const f = (k: string) => (form.get(k) ?? "").toString();

  // 1) Staðfesta undirskrift (hafna fölsuðum köllum)
  const ok = verifyMailgunSignature(f("timestamp"), f("token"), f("signature"));
  if (!ok) {
    return NextResponse.json({ error: "Ógild undirskrift" }, { status: 401 });
  }

  const recipient = f("recipient").toLowerCase();
  const senderEmail = f("sender") || f("from");
  const senderName = f("from").replace(/<.*>/, "").trim() || null;
  const subject = f("subject") || null;
  const bodyText = f("body-plain") || f("stripped-text") || null;
  const bodyHtml = clean(f("body-html") || null);

  // Service role — framhjá RLS (þetta er traustur bakendakóði, aldrei í kliént)
  const supabase = createClient(supabaseUrl, serviceKey);

  // 2) Er móttakandinn hóps-2?
  const { data: isG2, error: g2Err } = await supabase.rpc("mail_is_group2", {
    p_email: recipient,
  });
  if (g2Err) {
    return NextResponse.json({ error: g2Err.message }, { status: 500 });
  }

  if (!isG2) {
    // Hópur 1 (Microsoft 365) eða óþekkt netfang. Við vistum EKKERT hér.
    // Framleiðsla: Mailgun Route sendir þessi netföng áfram á M365 (forward),
    // og óþekkt netföng enda í eðlilegu bounce hjá póstveitunni. Sjá MAILGATEWAY.md.
    return NextResponse.json({
      routed: "group1_microsoft",
      note: "Ekki hóps-2 móttakandi — beint áfram skv. MAILGATEWAY.md",
    });
  }

  // 3) Vista í innhólf appsins
  const { error: saveErr } = await supabase.rpc("mail_save_inbound", {
    p_recipient: recipient,
    p_sender_email: senderEmail,
    p_sender_name: senderName,
    p_subject: subject,
    p_body_text: bodyText,
    p_body_html: bodyHtml,
    p_raw: Object.fromEntries(
      [...form.entries()].filter(([, v]) => typeof v === "string")
    ),
    p_is_test: false,
  });
  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({ routed: "group2_app_inbox", saved: true });
}
