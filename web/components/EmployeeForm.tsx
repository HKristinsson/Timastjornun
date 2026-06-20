export interface ProjectOption {
  id: string;
  project_no: string;
  name: string;
}

export interface EmployeeDefaults {
  full_name?: string;
  employee_no?: string;
  phone?: string | null;
  email?: string | null;
  status?: string;
  assignedProjectIds?: string[];
}

export default function EmployeeForm({
  action,
  projects,
  defaults = {},
  isEdit = false,
}: {
  action: (formData: FormData) => void;
  projects: ProjectOption[];
  defaults?: EmployeeDefaults;
  isEdit?: boolean;
}) {
  const assigned = new Set(defaults.assignedProjectIds ?? []);
  return (
    <form action={action} className="max-w-2xl space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">Nafn</label>
        <input
          name="full_name"
          required
          defaultValue={defaults.full_name}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Starfsmannanúmer</label>
          <input
            name="employee_no"
            required
            defaultValue={defaults.employee_no}
            readOnly={isEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm read-only:bg-slate-100"
          />
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Kennitala <span className="text-slate-400">(dulkóðuð)</span>
            </label>
            <input
              name="national_id"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Sími</label>
          <input
            name="phone"
            defaultValue={defaults.phone ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Netfang</label>
          <input
            name="email"
            type="email"
            defaultValue={defaults.email ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {!isEdit && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="mb-1 block text-sm font-medium">
            Lykilorð fyrir innskráningu{" "}
            <span className="text-slate-400">(valfrjálst)</span>
          </label>
          <input
            name="password"
            type="text"
            autoComplete="off"
            placeholder="Skildu eftir autt ef starfsmaður á ekki að geta innskráð sig strax"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Ef þú setur lykilorð (a.m.k. 6 stafir) getur starfsmaðurinn strax innskráð
            sig með <strong>netfanginu</strong> hér að ofan og þessu lykilorði.
          </p>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">
          Má skrá sig á verkefni
        </label>
        <div className="grid grid-cols-2 gap-2">
          {projects.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="project_ids"
                value={p.id}
                defaultChecked={assigned.has(p.id)}
              />
              {p.project_no} {p.name}
            </label>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-slate-400">Engin verkefni til.</p>
          )}
        </div>
      </div>

      {isEdit && (
        <div>
          <label className="mb-1 block text-sm font-medium">Staða</label>
          <select
            name="status"
            defaultValue={defaults.status ?? "active"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="active">Virkur</option>
            <option value="inactive">Óvirkur</option>
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Vista
        </button>
        <a
          href="/dashboard/employees"
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50"
        >
          Hætta
        </a>
      </div>
    </form>
  );
}
