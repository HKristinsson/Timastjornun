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

export interface Group2Recipient {
  id: string;
  email: string;
  user_id: string | null;
  active: boolean;
  created_at: string;
}
