"use client";

// Þjónustulag póstgáttar — EINA leiðin sem UI talar við bakendann.
// Hrein eining án UI-tengsla svo hún flytjist beint í native app (Expo) síðar.
import { createClient } from "@/lib/supabase/client";
import type {
  InboundEmail,
  OutboundEmail,
  CompanyUser,
  Group2Recipient,
  EmailAttachment,
  Announcement,
  SentAnnouncement,
  AnnouncementReader,
} from "./types";

const BUCKET = "mail-attachments";

export async function checkIfGroup2Recipient(email: string): Promise<boolean> {
  const { data, error } = await createClient().rpc("mail_is_group2", { p_email: email });
  if (error) throw new Error(error.message);
  return data as boolean;
}

export async function listInbox(): Promise<InboundEmail[]> {
  const { data, error } = await createClient()
    .from("v_my_inbox")
    .select("*")
    .order("received_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InboundEmail[];
}

export async function readEmail(emailId: string): Promise<InboundEmail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_my_inbox")
    .select("*")
    .eq("id", emailId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await supabase.rpc("mail_mark_read", { p_id: emailId });
  return (data as InboundEmail) ?? null;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<OutboundEmail> {
  const { data, error } = await createClient().rpc("mail_send", {
    p_to: to,
    p_subject: subject,
    p_body: body,
    p_reply_to: null,
  });
  if (error) throw new Error(error.message);
  return data as OutboundEmail;
}

export async function replyToEmail(
  emailId: string,
  toEmail: string,
  subject: string,
  body: string
): Promise<OutboundEmail> {
  const { data, error } = await createClient().rpc("mail_send", {
    p_to: toEmail,
    p_subject: subject,
    p_body: body,
    p_reply_to: emailId,
  });
  if (error) throw new Error(error.message);
  return data as OutboundEmail;
}

// Lesa eitt sent skeyti (úthólf)
export async function readSent(id: string): Promise<OutboundEmail | null> {
  const { data, error } = await createClient()
    .from("v_my_sent")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OutboundEmail) ?? null;
}

export async function listSent(): Promise<OutboundEmail[]> {
  const { data, error } = await createClient()
    .from("v_my_sent")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OutboundEmail[];
}

// Eyða skeyti úr eigin innhólfi (úthólfsafrit sendanda helst óbreytt)
export async function deleteInbound(emailId: string): Promise<void> {
  const { error } = await createClient().rpc("mail_delete_inbound", { p_id: emailId });
  if (error) throw new Error(error.message);
}

// Eyða skeyti úr eigin úthólfi (innhólfsafrit viðtakanda helst óbreytt)
export async function deleteOutbound(emailId: string): Promise<void> {
  const { error } = await createClient().rpc("mail_delete_outbound", { p_id: emailId });
  if (error) throw new Error(error.message);
}

// Eyða mörgum í einu
export async function deleteInboundMany(ids: string[]): Promise<void> {
  const { error } = await createClient().rpc("mail_delete_inbound_many", { p_ids: ids });
  if (error) throw new Error(error.message);
}

export async function deleteOutboundMany(ids: string[]): Promise<void> {
  const { error } = await createClient().rpc("mail_delete_outbound_many", { p_ids: ids });
  if (error) throw new Error(error.message);
}

// Merkja/afmerkja póst sem eftirlæti (stjarna)
export async function setStar(emailId: string, star: boolean): Promise<void> {
  const { error } = await createClient().rpc("mail_set_star", {
    p_id: emailId,
    p_star: star,
  });
  if (error) throw new Error(error.message);
}

// Allir virkir notendur míns félags (fyrir viðtakendalista í "Nýtt skeyti")
export async function listCompanyUsers(): Promise<CompanyUser[]> {
  const { data, error } = await createClient().rpc("mail_company_users");
  if (error) throw new Error(error.message);
  return (data ?? []) as CompanyUser[];
}

// Senda á marga viðtakendur (komma/semíkomma aðskilið). Eitt skeyti per viðtakanda.
export function splitRecipients(input: string): string[] {
  return input
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

// Hefur núverandi notandi aðgang að tölvupósti (hópur 2 eða stjórnandi)?
export async function myMailAccess(): Promise<{
  hasMail: boolean;
  isManager: boolean;
  email: string | null;
}> {
  const supabase = createClient();
  const { data: session } = await supabase.auth.getUser();
  const email = session.user?.email ?? null;
  const [{ data: roles }, g2] = await Promise.all([
    supabase.rpc("my_roles"),
    email
      ? supabase.rpc("mail_is_group2", { p_email: email })
      : Promise.resolve({ data: false }),
  ]);
  const r: string[] = roles ?? [];
  const isManager = r.includes("admin") || r.includes("project_manager");
  return { hasMail: (g2.data as boolean) || isManager, isManager, email };
}

// --- Skilaboðaskjóða (tilkynningar með les-staðfestingu) ------------------------
export async function listMyAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await createClient().from("v_my_announcements").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as Announcement[];
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const { error } = await createClient().rpc("ann_mark_read", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function sendAnnouncement(title: string, body: string): Promise<void> {
  const { error } = await createClient().rpc("ann_send", { p_title: title, p_body: body });
  if (error) throw new Error(error.message);
}

export async function listSentAnnouncements(): Promise<SentAnnouncement[]> {
  const { data, error } = await createClient().from("v_sent_announcements").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as SentAnnouncement[];
}

export async function announcementReaders(id: string): Promise<AnnouncementReader[]> {
  const { data, error } = await createClient().rpc("ann_readers", { p_id: id });
  if (error) throw new Error(error.message);
  return (data ?? []) as AnnouncementReader[];
}

// --- Viðhengi -------------------------------------------------------------------

// Hlaða upp skrá (mynd/skjali) fyrir útsent skeyti. Slóð: <auth_uid>/<uuid>-<nafn>
export async function uploadAttachment(file: File): Promise<string> {
  const supabase = createClient();
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) throw new Error("Ekki innskráð(ur).");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${uid}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  return path;
}

// Tengja upphlaðið viðhengi við sent skeyti
export async function addOutboundAttachment(
  outboundId: string,
  file: File,
  storagePath: string
): Promise<void> {
  const { error } = await createClient().rpc("mail_add_outbound_attachment", {
    p_outbound_id: outboundId,
    p_filename: file.name,
    p_content_type: file.type || null,
    p_storage_path: storagePath,
    p_size_bytes: file.size,
  });
  if (error) throw new Error(error.message);
}

export async function listAttachments(opts: {
  inboundId?: string;
  outboundId?: string;
}): Promise<EmailAttachment[]> {
  let q = createClient().from("email_attachments").select("*");
  if (opts.inboundId) q = q.eq("inbound_email_id", opts.inboundId);
  if (opts.outboundId) q = q.eq("outbound_email_id", opts.outboundId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as EmailAttachment[];
}

// Tímabundin (1 klst) örugg slóð til að skoða/sækja viðhengi
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await createClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Engin slóð.");
  return data.signedUrl;
}

// --- Admin: hóps-2 móttakendur ------------------------------------------------
export async function listRecipients(): Promise<Group2Recipient[]> {
  const { data, error } = await createClient()
    .from("group2_recipients")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Group2Recipient[];
}

export async function upsertRecipient(email: string, fullName?: string): Promise<void> {
  const { error } = await createClient().rpc("mail_upsert_recipient", {
    p_email: email,
    p_full_name: fullName ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function setRecipientActive(id: string, active: boolean): Promise<void> {
  const { error } = await createClient().rpc("mail_set_recipient_active", {
    p_id: id,
    p_active: active,
  });
  if (error) throw new Error(error.message);
}
