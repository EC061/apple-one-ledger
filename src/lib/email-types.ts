export interface EmailRow {
  id: string;
  to_addr: string;
  subject: string;
  kind: string;
  status: string;
  error: string | null;
  created_at: string;
}
