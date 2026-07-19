"use client";

// Undirnúmer á verkstað: listi + stofna + virkja/afvirkja + eyða.
// Starfsmenn velja undirnúmer við innskráningu í appinu.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ProjectTask {
  id: string;
  task_no: string;
  name: string;
  active: boolean;
}

export default function ProjectTasks({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskNo, setTaskNo] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("project_tasks")
      .select("id, task_no, name, active")
      .eq("project_id", projectId)
      .order("task_no");
    setTasks((data ?? []) as ProjectTask[]);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!taskNo.trim() || !name.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc("project_task_create", {
      p_project_id: projectId,
      p_task_no: taskNo.trim(),
      p_name: name.trim(),
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("duplicate")
          ? "Undirnúmerið er þegar til á þessu verkefni."
          : error.message
      );
      return;
    }
    setTaskNo("");
    setName("");
    load();
  }

  async function toggleActive(t: ProjectTask) {
    await createClient().rpc("project_task_update", {
      p_id: t.id,
      p_task_no: null,
      p_name: null,
      p_active: !t.active,
    });
    load();
  }

  async function remove(t: ProjectTask) {
    if (!window.confirm(`Eyða undirnúmeri ${t.task_no} — ${t.name}?`)) return;
    await createClient().rpc("project_task_delete", { p_id: t.id });
    load();
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/60">
      <h2 className="text-[15px] font-semibold text-slate-800">Undirnúmer á verkstað</h2>
      <p className="mt-1 text-sm text-slate-500">
        Starfsmaður velur undirnúmer við innskráningu — tímarnir skiptast þá á
        undirnúmerin í skýrslum.
      </p>

      {tasks.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          {tasks.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 ${
                i > 0 ? "border-t border-slate-100" : ""
              } ${t.active ? "" : "opacity-50"}`}
            >
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[13px] font-semibold text-slate-700">
                {t.task_no}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                {t.name}
              </span>
              <button
                type="button"
                onClick={() => toggleActive(t)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${
                  t.active
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-slate-50 text-slate-500 ring-slate-200"
                }`}
              >
                {t.active ? "Virkt" : "Óvirkt"}
              </button>
              <button
                type="button"
                onClick={() => remove(t)}
                aria-label={`Eyða ${t.task_no}`}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={taskNo}
          onChange={(e) => setTaskNo(e.target.value)}
          placeholder="Nr. (t.d. 01)"
          className="w-28 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm outline-none focus:border-brand focus:bg-white"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Heiti (t.d. Múrverk)"
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm outline-none focus:border-brand focus:bg-white"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !taskNo.trim() || !name.trim()}
          className="rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
        >
          + Bæta við
        </button>
      </div>
    </div>
  );
}
