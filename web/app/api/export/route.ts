import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRow {
  employee_no: string;
  employee_name: string;
  project_no: string;
  project_name: string;
  check_in_at: string;
  check_out_at: string | null;
  worked_hours: number | null;
  status: string;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") ?? "approved";
  const from = sp.get("from");
  const to = sp.get("to");

  const supabase = await createClient();
  let q = supabase
    .from("v_time_entries")
    .select(
      "employee_no, employee_name, project_no, project_name, check_in_at, check_out_at, worked_hours, status"
    )
    .order("check_in_at", { ascending: true });
  if (status !== "all") q = q.eq("status", status);
  if (from) q = q.gte("check_in_at", from);
  if (to) q = q.lte("check_in_at", `${to}T23:59:59`);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const rows = (data ?? []) as ExportRow[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tímaskráningar");
  ws.columns = [
    { header: "Starfsm.nr", key: "employee_no", width: 12 },
    { header: "Nafn", key: "employee_name", width: 26 },
    { header: "Verk nr.", key: "project_no", width: 10 },
    { header: "Verkefni", key: "project_name", width: 24 },
    { header: "Inn", key: "check_in_at", width: 20 },
    { header: "Út", key: "check_out_at", width: 20 },
    { header: "Klst", key: "worked_hours", width: 8 },
    { header: "Staða", key: "status", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };

  for (const r of rows) {
    ws.addRow({
      employee_no: r.employee_no,
      employee_name: r.employee_name,
      project_no: r.project_no,
      project_name: r.project_name,
      check_in_at: r.check_in_at ? new Date(r.check_in_at) : null,
      check_out_at: r.check_out_at ? new Date(r.check_out_at) : null,
      worked_hours: r.worked_hours,
      status: r.status,
    });
  }

  // Samtala klst neðst
  if (rows.length > 0) {
    const total = rows.reduce((s, r) => s + (r.worked_hours ?? 0), 0);
    const totalRow = ws.addRow({ project_name: "Samtals", worked_hours: Math.round(total * 100) / 100 });
    totalRow.font = { bold: true };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `timaskraningar_${status}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
