// ═══ Carga de trabajo por telemarketing ════════════════════════════════════
import { workload } from "../../services/assignments";
import { ROLE_SPECIALTY, Role } from "../../auth/roles";

type Tm = { uid: string; nombre: string; role: string; status: string };
const fecha = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-US", { month: "short", day: "numeric" }) : "—");

export function WorkloadTable({ team, records, appts }: { team: Tm[]; records: any[]; appts: any[] }) {
  const tms = team.filter((m) => String(m.role).startsWith("telemarketing_"));
  if (!tms.length) return <div className="text-sm text-[#94A3B8] p-4 text-center">No hay telemarketing en esta app.</div>;
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] uppercase tracking-wider text-[#667085] border-b border-[#EEF1F5]">
          {["Persona", "Asignados", "Pendientes", "Trabajados", "Citas", "Ventas", "Recontactos", "Última act."].map((h) => <th key={h} className="text-left px-3 py-2 font-bold whitespace-nowrap">{h}</th>)}
        </tr></thead>
        <tbody>
          {tms.map((m) => {
            const w = workload(records, appts, m.uid, m.nombre);
            return (
              <tr key={m.uid} className="border-b border-[#F3F4F6] last:border-0">
                <td className="px-3 py-2"><div className="font-bold text-[#111827]">{m.nombre}</div><div className="text-[11px] text-[#94A3B8]">{ROLE_SPECIALTY[m.role as Role]}{m.status !== "active" ? " · " + m.status : ""}</div></td>
                <td className="px-3 py-2 font-bold">{w.asignados}</td>
                <td className="px-3 py-2">{w.pendientes}</td>
                <td className="px-3 py-2">{w.trabajados}</td>
                <td className="px-3 py-2">{w.citas}</td>
                <td className="px-3 py-2">{w.ventas}</td>
                <td className="px-3 py-2">{w.recontactos}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fecha(w.ultimaActividad)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
