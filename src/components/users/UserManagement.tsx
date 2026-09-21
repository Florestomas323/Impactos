// ═══ Configuración → Usuarios y permisos ═══════════════════════════════════
import { useMemo, useState } from "react";
import { Modal, Field, PrimaryBtn, inpLight } from "../primitives";
import { ROLE_LABEL, ROLE_SPECIALTY, DEFAULT_LIMITS, Role } from "../../auth/roles";
import { countSeats, telemarketingTotal } from "../../auth/workspaces";
import { manageableRoles, AppUser } from "../../auth/permissions";
import { useTeam, Member } from "../../services/members";
import { callUsersApi, UsersAction } from "../../services/users";

const ESTADO: Record<string, { t: string; c: string }> = {
  active: { t: "Activo", c: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  invited: { t: "Invitado", c: "text-blue-700 bg-blue-50 border-blue-200" },
  inactive: { t: "Inactivo", c: "text-slate-500 bg-slate-50 border-slate-200" },
  suspended: { t: "Suspendido", c: "text-amber-700 bg-amber-50 border-amber-200" },
};
const fecha = (iso?: string) => (iso ? new Date(iso).toLocaleString("es-US", { dateStyle: "short", timeStyle: "short" }) : "—");
const rolTxt = (r: string) => `${ROLE_LABEL[r as Role] || r}${ROLE_SPECIALTY[r as Role] && !["—", "Global"].includes(ROLE_SPECIALTY[r as Role]) ? " · " + ROLE_SPECIALTY[r as Role] : ""}`;

type Props = {
  me: AppUser & { uid: string };
  getDB: () => Promise<any>;
  getIdToken: () => Promise<string>;
  assignedCount: (uid: string) => number;   // registros asignados (del store)
  notify?: (m: string) => void;
  goToAsignaciones?: () => void;
};

export function UserManagement({ me, getDB, getIdToken, assignedCount, notify, goToAsignaciones }: Props) {
  const [appId, setAppId] = useState(me.appId || "impactos");
  const { members, invitations, workspaces, error } = useTeam(getDB, me as any, appId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [invitar, setInvitar] = useState(false);
  const [editar, setEditar] = useState<Member | null>(null);
  const [mover, setMover] = useState<Member | null>(null);
  const roles = manageableRoles(me);
  const ws = workspaces.find((w) => w.id === appId);
  const limits = { ...DEFAULT_LIMITS, ...(ws?.limits || {}) };
  // Cupos que se MUESTRAN (el servidor vuelve a contar al decidir).
  const counts = useMemo(() => countSeats([...members, ...invitations.map((i) => ({ ...i, status: "invited" }))] as any, appId), [members, invitations, appId]);

  const act = async (body: UsersAction, ok?: string) => {
    setBusy(true); setMsg(null);
    const r = await callUsersApi(getIdToken, body);
    setBusy(false); setMsg({ ok: r.ok, t: r.ok ? ok || r.message : r.message });
    if (r.ok) notify?.(ok || r.message);
    return r.ok;
  };
  const puedeTocar = (m: Member) => m.uid !== me.uid && m.role !== "super_admin" && (me.role === "super_admin" || roles.includes(m.role as Role));

  const lista = [...members].sort((a, b) => (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || String(a.nombre).localeCompare(String(b.nombre)));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#111827]">Usuarios y permisos</h1>
          <div className="text-sm text-[#667085]">El acceso se gestiona aquí. Nadie más tiene que tocar Firebase.</div>
        </div>
        <div className="flex gap-2 items-center">
          {me.role === "super_admin" && workspaces.length > 1 && (
            <select className={inpLight + " !w-auto"} value={appId} onChange={(e) => setAppId(e.target.value)}>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.nombre || w.id}</option>)}
            </select>
          )}
          {roles.length > 0 && <PrimaryBtn onClick={() => setInvitar(true)} disabled={busy}>+ Invitar</PrimaryBtn>}
        </div>
      </div>

      {/* Cupos */}
      <div className="grid grid-cols-3 gap-2">
        {[["Distribuidores", counts.distribuidor || 0, limits.distribuidor], ["Supervisores", counts.supervisor || 0, limits.supervisor], ["Telemarketing", telemarketingTotal(counts), limits.telemarketing_total]].map(([t, n, l]: any) => (
          <div key={t} className={`rounded-2xl p-3 border bg-white ${n >= l ? "border-amber-300" : "border-[#E5E7EB]"}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">{t}</div>
            <div className="text-xl font-extrabold text-[#111827]">{n}<span className="text-sm text-[#94A3B8]"> / {l}</span></div>
            {n >= l && <div className="text-[11px] text-amber-700 font-bold">Cupo lleno</div>}
          </div>
        ))}
      </div>
      <div className="text-xs text-[#94A3B8]">Los 6 puestos de telemarketing se reparten libremente entre Ventas, Cobranza y Reclutamiento.</div>

      {(msg || error) && <div className={`text-sm font-bold rounded-xl px-3 py-2 border ${msg?.ok ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200"}`}>{msg?.t || error}</div>}

      {/* Usuarios */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] divide-y divide-[#EEF1F5]">
        {lista.map((m) => {
          const n = assignedCount(m.uid);
          return (
            <div key={m.uid} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[#111827] truncate">{m.nombre || m.email}{m.uid === me.uid && <span className="text-[#94A3B8] font-normal"> (tú)</span>}</div>
                  <div className="text-xs text-[#667085] truncate">{m.email}</div>
                  <div className="text-xs text-[#667085] mt-1">{rolTxt(m.role)} · {m.appId}</div>
                  <div className="text-[11px] text-[#94A3B8] mt-0.5">{n} asignados · última actividad {fecha(m.lastActiveAt)}</div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${ESTADO[m.status]?.c || ""}`}>{ESTADO[m.status]?.t || m.status}</span>
              </div>
              {puedeTocar(m) && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]" disabled={busy} onClick={() => setEditar(m)}>Editar rol</button>
                  {m.status === "active"
                    ? <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-red-200 text-red-700" disabled={busy}
                        onClick={() => confirm(`¿Desactivar a ${m.nombre}? Pierde el acceso al instante.${n ? `\n\nTiene ${n} registros asignados: retíralos o reasígnalos en Distribución de datos.` : ""}`) && act({ action: "setStatus", uid: m.uid, status: "inactive" })}>Desactivar</button>
                    : <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700" disabled={busy}
                        onClick={() => act({ action: "setStatus", uid: m.uid, status: "active" })}>Activar</button>}
                  {m.status === "active" && <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700" disabled={busy}
                    onClick={() => confirm(`¿Suspender a ${m.nombre}? No entra, pero conserva su puesto.`) && act({ action: "setStatus", uid: m.uid, status: "suspended" })}>Suspender</button>}
                  {n > 0 && goToAsignaciones && <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]" onClick={goToAsignaciones}>Reasignar / retirar datos</button>}
                  {me.role === "super_admin" && <button className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[#E2E8F0]" disabled={busy} onClick={() => setMover(m)}>Mover de app</button>}
                </div>
              )}
            </div>
          );
        })}
        {invitations.map((i) => (
          <div key={i.email} className="p-4 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-[#111827] truncate">{i.nombre || i.email}</div>
              <div className="text-xs text-[#667085] truncate">{i.email}</div>
              <div className="text-xs text-[#667085] mt-1">{rolTxt(i.role)} · esperando que entre con Google</div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${ESTADO.invited.c}`}>Invitado</span>
              {(me.role === "super_admin" || roles.includes(i.role as Role)) &&
                <button className="text-xs font-bold text-red-700" disabled={busy} onClick={() => confirm(`¿Revocar la invitación de ${i.email}?`) && act({ action: "revokeInvitation", email: i.email })}>Revocar</button>}
            </div>
          </div>
        ))}
        {!lista.length && !invitations.length && <div className="p-6 text-center text-sm text-[#94A3B8]">Todavía no hay usuarios en esta app.</div>}
      </div>

      {invitar && <InviteForm roles={roles} appId={appId} busy={busy} onClose={() => setInvitar(false)}
        onSubmit={async (f) => { if (await act({ action: "invite", ...f, appId })) setInvitar(false); }} />}
      {editar && <RoleForm m={editar} roles={roles} busy={busy} onClose={() => setEditar(null)}
        onSubmit={async (role, nombre) => {
          let ok = true;
          if (nombre && nombre !== editar.nombre) ok = await act({ action: "rename", uid: editar.uid, nombre });
          if (ok && role !== editar.role) ok = await act({ action: "changeRole", uid: editar.uid, role });
          if (ok) setEditar(null);
        }} />}
      {mover && <Modal title={`Mover a ${mover.nombre}`} onClose={() => setMover(null)}>
        <MoveForm workspaces={workspaces.map((w) => w.id).filter((w) => w !== mover.appId)} busy={busy}
          onSubmit={async (dest) => { if (await act({ action: "moveApp", uid: mover.uid, appId: dest })) setMover(null); }} />
      </Modal>}
    </div>
  );
}

function InviteForm({ roles, appId, busy, onClose, onSubmit }: { roles: Role[]; appId: string; busy: boolean; onClose: () => void; onSubmit: (f: { nombre: string; email: string; role: Role }) => void }) {
  const [nombre, setNombre] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>(roles.includes("telemarketing_ventas") ? "telemarketing_ventas" : roles[0]);
  return (
    <Modal title="Invitar usuario" onClose={onClose}>
      <Field label="Nombre" required><input className={inpLight} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Yelitza" /></Field>
      <Field label="Correo de Google" required><input className={inpLight} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" placeholder="nombre@gmail.com" /></Field>
      <Field label="Rol" required>
        <select className={inpLight} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => <option key={r} value={r}>{rolTxt(r)}</option>)}
        </select>
      </Field>
      <div className="text-xs text-[#667085] mb-3">App: <b>{appId}</b>. La persona entra con Google usando ese mismo correo y el acceso se activa solo.</div>
      <PrimaryBtn full disabled={busy || !email.trim() || !nombre.trim()} onClick={() => onSubmit({ nombre: nombre.trim(), email: email.trim(), role })}>{busy ? "Enviando…" : "Crear invitación"}</PrimaryBtn>
    </Modal>
  );
}

function RoleForm({ m, roles, busy, onClose, onSubmit }: { m: Member; roles: Role[]; busy: boolean; onClose: () => void; onSubmit: (r: Role, nombre: string) => void }) {
  const [role, setRole] = useState<Role>(m.role as Role); const [nombre, setNombre] = useState(m.nombre || "");
  return (
    <Modal title={`Editar a ${m.nombre || m.email}`} onClose={onClose}>
      <Field label="Nombre"><input className={inpLight} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Field>
      <Field label="Rol"><select className={inpLight} value={role} onChange={(e) => setRole(e.target.value as Role)}>{roles.map((r) => <option key={r} value={r}>{rolTxt(r)}</option>)}</select></Field>
      <div className="text-xs text-[#667085] mb-3">Cambiar de especialidad no borra nada: sus datos asignados siguen igual. Revísalos en Distribución de datos.</div>
      <PrimaryBtn full disabled={busy} onClick={() => onSubmit(role, nombre.trim())}>{busy ? "Guardando…" : "Guardar"}</PrimaryBtn>
    </Modal>
  );
}

function MoveForm({ workspaces, busy, onSubmit }: { workspaces: string[]; busy: boolean; onSubmit: (d: string) => void }) {
  const [dest, setDest] = useState(workspaces[0] || "");
  if (!workspaces.length) return <div className="text-sm text-[#667085]">No hay otra app a la cual moverlo.</div>;
  return (<>
    <Field label="App destino"><select className={inpLight} value={dest} onChange={(e) => setDest(e.target.value)}>{workspaces.map((w) => <option key={w}>{w}</option>)}</select></Field>
    <div className="text-xs text-[#667085] mb-3">Debe tener cupo en la app destino y ningún registro asignado en la actual.</div>
    <PrimaryBtn full disabled={busy || !dest} onClick={() => onSubmit(dest)}>Mover</PrimaryBtn>
  </>);
}
