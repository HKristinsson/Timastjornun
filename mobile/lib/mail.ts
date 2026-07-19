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

export async function myAccess(): Promise<{ hasMail: boolean; email: string | null }> {
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
  return { hasMail: (g2.data as boolean) || isManager, email };
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

export function splitRecipients(input: string): string[] {
  return input
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

export async function sendMessage(to: string, subject: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("mail_send", {
    p_to: to,
    p_subject: subject,
    p_body: body,
    p_reply_to: null,
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
  note: string | null
): Promise<void> {
  const { error } = await supabase.rpc("absence_register", {
    p_from: from,
    p_to: to,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function listMyAbsences(): Promise<Absence[]> {
  const { data } = await supabase.from("v_my_absences").select("id, date_from, date_to, note");
  return (data ?? []) as Absence[];
}
