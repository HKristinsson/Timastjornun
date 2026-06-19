// Sameiginlegar gerðir fyrir stjórnborðið.
// (Síðar má sjálfgenera úr Supabase með `supabase gen types typescript`.)

export type RoleName = "admin" | "project_manager" | "employee" | "payroll";

export type ProjectStatus = "active" | "inactive";

export interface Project {
  id: string;
  tenant_id: string;
  project_no: string;
  name: string;
  description: string | null;
  address: string | null;
  manager_user_id: string | null;
  start_date: string | null;
  planned_end_date: string | null;
  status: ProjectStatus;
  created_at: string;
}

export interface Employee {
  id: string;
  tenant_id: string;
  full_name: string;
  employee_no: string;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
}

export type TimeEntryStatus = "active" | "pending" | "approved" | "rejected";

export interface TimeEntry {
  id: string;
  tenant_id: string;
  employee_id: string;
  project_id: string;
  check_in_at: string;
  check_out_at: string | null;
  check_out_type: "manual" | "auto_geofence" | "auto_gps_lost" | "admin" | null;
  worked_minutes: number | null;
  note: string | null;
  status: TimeEntryStatus;
}

// Yfirlit yfir virka skráningu (fyrir lifandi dashboard)
export interface ActiveEntryView extends TimeEntry {
  employee_name: string;
  project_name: string;
  inside_geofence: boolean | null;
}
