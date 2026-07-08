"use client";

// Þjónustulag póstgáttar — EINA leiðin sem UI talar við bakendann.
// Hrein eining án UI-tengsla svo hún flytjist beint í native app (Expo) síðar.
import { createClient } from "@/lib/supabase/client";
import type { InboundEmail, OutboundEmail, Group2Recipient } from "./types";

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

export async function listSent(): Promise<OutboundEmail[]> {
  const { data, error } = await createClient()
    .from("v_my_sent")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OutboundEmail[];
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
