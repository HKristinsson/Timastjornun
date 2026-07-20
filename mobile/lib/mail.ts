// Þjónustulag skilaboða, tilkynninga og veikinda í appinu.
// Speglar web/lib/mail — sama Supabase-bakendi.
import { supabase } from "./supabase";

export interface InboundMessage {
  id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  read_at: string | null;
  is_starred: boolean;
}

export interface OutboundMessage {
  id: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  status: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender_name: string | null;
}

export interface Absence {
  id: string;
  type: string;
  date_from: string;
  date_to: string;
  note: string | null;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  content_type: string | null;
  storage_path: string | null;
}

export async function myAccess(): Promise<{
  hasMail: boolean;
  isManager: boolean;
  email: string | null;
}> {
  const { data: session } = await supabase.auth.getUser();
  const email = session.user?.email ?? null;
  const [{ data: roles }, g2] = await Promise.all([
    supabase.rpc("my_roles"),
    email
      ? supabase.rpc("mail_is_group2", { p_email: email })
      : Promise.resolve({ data: false } as { data: boolean }),
  ]);
  const r: string[] = (roles as string[]) ?? [];
  const isManager = r.includes("admin") || r.includes("project_manager");
  return { hasMail: (g2.data as boolean) || isManager, isManager, email };
}

export async function listInbox(): Promise<InboundMessage[]> {
  const { data } = await supabase
    .from("v_my_inbox")
    .select("id, sender_email, sender_name, subject, body_text, received_at, read_at, is_starred")
    .order("received_at", { ascending: false });
  return (data ?? []) as InboundMessage[];
}

export async function readMessage(id: string): Promise<InboundMessage | null> {
  const { data } = await supabase
    .from("v_my_inbox")
    .select("id, sender_email, sender_name, subject, body_text, received_at, read_at, is_starred")
    .eq("id", id)
    .maybeSingle();
  if (data) await supabase.rpc("mail_mark_read", { p_id: id });
  return (data as InboundMessage) ?? null;
}

export async function listSent(): Promise<OutboundMessage[]> {
  const { data } = await supabase
    .from("v_my_sent")
    .select("id, to_email, subject, body_text, status, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as OutboundMessage[];
}

// Merkja lesið/ólesið (swipe-aðgerðir)
export async function markRead(id: string): Promise<void> {
  await supabase.rpc("mail_mark_read", { p_id: id });
}

export async function markUnread(id: string): Promise<void> {
  await supabase.rpc("mail_mark_unread", { p_id: id });
}

// Eyða skeyti úr eigin innhólfi
export async function deleteMessage(inboundId: string): Promise<void> {
  const { error } = await supabase.rpc("mail_delete_inbound", { p_id: inboundId });
  if (error) throw new Error(error.message);
}

// Eyða skeyti úr eigin úthólfi (afrit viðtakanda helst)
export async function deleteSentMessage(outboundId: string): Promise<void> {
  const { error } = await supabase.rpc("mail_delete_outbound", { p_id: outboundId });
  if (error) throw new Error(error.message);
}

// Eyða mörgum í einu
export async function deleteMessagesMany(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("mail_delete_inbound_many", { p_ids: ids });
  if (error) throw new Error(error.message);
}

export async function deleteSentMany(ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("mail_delete_outbound_many", { p_ids: ids });
  if (error) throw new Error(error.message);
}

export interface CompanyUser {
  email: string;
  full_name: string;
}

// Allir virkir notendur míns félags (viðtakendalisti í "Nýtt skeyti")
export async function listCompanyUsers(): Promise<CompanyUser[]> {
  const { data } = await supabase.rpc("mail_company_users");
  return (data ?? []) as CompanyUser[];
}

export function splitRecipients(input: string): string[] {
  return input
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export async function sendMessage(
  to: string,
  subject: string,
  body: string
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc("mail_send", {
    p_to: to,
    p_subject: subject,
    p_body: body,
    p_reply_to: null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

// --- Viðhengi við sendingu ---------------------------------------------------

// Hlaða mynd (base64) í Storage. Slóð verður að byrja á auth-uid (RLS-regla).
export async function uploadAttachmentBase64(
  base64: string,
  filename: string,
  contentType: string
): Promise<string> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) throw new Error("Ekki innskráð(ur).");

  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage
    .from("mail-attachments")
    .upload(path, bytes.buffer as ArrayBuffer, { contentType });
  if (error) throw new Error(error.message);
  return path;
}

// Tengja upphlaðið viðhengi við sent skeyti (afritast á innhólf viðtakanda)
export async function addOutboundAttachment(
  outboundId: string,
  filename: string,
  contentType: string,
  storagePath: string,
  sizeBytes: number
): Promise<void> {
  const { error } = await supabase.rpc("mail_add_outbound_attachment", {
    p_outbound_id: outboundId,
    p_filename: filename,
    p_content_type: contentType,
    p_storage_path: storagePath,
    p_size_bytes: sizeBytes,
  });
  if (error) throw new Error(error.message);
}

export async function listAttachments(inboundId: string): Promise<MessageAttachment[]> {
  const { data } = await supabase
    .from("email_attachments")
    .select("id, filename, content_type, storage_path")
    .eq("inbound_email_id", inboundId);
  return (data ?? []) as MessageAttachment[];
}

export async function attachmentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("mail-attachments").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const { data } = await supabase.from("v_my_announcements").select("*");
  return (data ?? []) as Announcement[];
}

export async function markAnnouncementRead(id: string): Promise<void> {
  await supabase.rpc("ann_mark_read", { p_id: id });
}

export async function registerAbsence(
  from: string,
  to: string,
  note: string | null,
  kind: "sick" | "vacation" = "sick"
): Promise<void> {
  const { error } = await supabase.rpc("absence_register", {
    p_from: from,
    p_to: to,
    p_note: note,
    p_kind: kind,
  });
  if (error) throw new Error(error.message);
}

// Slóð starfsmannamyndar -> tímabundin skoðunarslóð
export async function employeePhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from("employee-photos")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function listMyAbsences(): Promise<Absence[]> {
  const { data } = await supabase
    .from("v_my_absences")
    .select("id, type, date_from, date_to, note");
  return (data ?? []) as Absence[];
}
