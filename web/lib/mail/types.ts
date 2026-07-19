// Gerðir fyrir póstgáttina (hópur 2 = vettvangsstarfsmenn með innhólf í appinu).

export interface InboundEmail {
  id: string;
  recipient_email: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null; // þegar hreinsað (sanitized) við móttöku
  received_at: string;
  read_at: string | null;
  status: "received" | "archived";
  is_test: boolean;
  is_starred: boolean;
}

export interface OutboundEmail {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  in_reply_to: string | null;
  status: "queued" | "sent" | "mock_sent" | "failed";
  sent_at: string | null;
  created_at: string;
}

// Notandi í mínu félagi — viðtakendalisti í "Nýtt skeyti"
export interface CompanyUser {
  email: string;
  full_name: string;
}

export interface Group2Recipient {
  id: string;
  email: string;
  user_id: string | null;
  active: boolean;
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

export interface SentAnnouncement {
  id: string;
  title: string;
  body: string;
  created_at: string;
  total: number;
  read_count: number;
}

export interface AnnouncementReader {
  full_name: string;
  email: string;
  read_at: string | null;
}

export interface EmailAttachment {
  id: string;
  inbound_email_id: string | null;
  outbound_email_id: string | null;
  filename: string;
  content_type: string | null;
  storage_path: string | null;
  size_bytes: number | null;
}
