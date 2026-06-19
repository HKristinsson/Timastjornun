import MapPicker from "@/components/MapPicker";

export interface ManagerOption {
  id: string;
  email: string | null;
}

export interface ProjectDefaults {
  project_no?: string;
  name?: string;
  description?: string | null;
  address?: string | null;
  manager_user_id?: string | null;
  start_date?: string | null;
  planned_end_date?: string | null;
  status?: string;
  lat?: number | null;
  lng?: number | null;
  radius_m?: number | null;
}

export default function ProjectForm({
  action,
  managers,
  defaults = {},
  isEdit = false,
}: {
  action: (formData: FormData) => void;
  managers: ManagerOption[];
  defaults?: ProjectDefaults;
  isEdit?: boolean;
}) {
  return (
    <form action={action} className="max-w-3xl space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Verkefnisnúmer</label>
          <input
            name="project_no"
            required
            defaultValue={defaults.project_no}
            readOnly={isEdit}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm read-only:bg-slate-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Nafn</label>
          <input
            name="name"
            required
            defaultValue={defaults.name}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Lýsing</label>
        <textarea
          name="description"
          defaultValue={defaults.description ?? ""}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Staðsetning og svæði</label>
        <MapPicker
          initialLat={defaults.lat ?? null}
          initialLng={defaults.lng ?? null}
          initialRadius={defaults.radius_m ?? 100}
          initialAddress={defaults.address ?? ""}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Verkefnastjóri</label>
          <select
            name="manager_user_id"
            defaultValue={defaults.manager_user_id ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— Velja —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email ?? m.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Byrjun</label>
          <input
            type="date"
            name="start_date"
            defaultValue={defaults.start_date ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Áætluð verklok</label>
          <input
            type="date"
            name="planned_end_date"
            defaultValue={defaults.planned_end_date ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
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
            <option value="active">Virkt</option>
            <option value="inactive">Óvirkt</option>
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
          href="/dashboard/projects"
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50"
        >
          Hætta
        </a>
      </div>
    </form>
  );
}
