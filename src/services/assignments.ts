// ═══ ASIGNACIÓN / REASIGNACIÓN DE DATOS — lógica pura ══════════════════════
// Regla de oro: asignar o reasignar SOLO toca los campos de ASSIGNMENT_FIELDS
// (+ asignado_a para mostrar el nombre y "actualizado"). Notas, mensajes,
// historial, citas, ventas, estados y fechas de contacto JAMÁS se tocan aquí.
import { AssignmentType } from "../auth/roles";

export const ASSIGNMENT_FIELDS = [
  "assignedTo", "assignedToName", "assignedBy", "assignedAt",
  "assignmentType", "assignmentStatus", "assignmentHistory", "workStatus",
] as const;
const TOUCHABLE = new Set<string>([...ASSIGNMENT_FIELDS, "asignado_a", "actualizado"]);

export type WorkStatus = "fresh" | "worked" | "recontact" | "blocked";
export type AssignmentEntry = {
  userId: string; userName: string; type: AssignmentType;
  assignedBy: string; assignedAt: string;
  unassignedAt: string | null; unassignedBy: string | null; reason: string;
};

const ESTADOS_NO_CONTESTO = ["naranja", "buzon"];
const ESTADOS_BLOQUEO = ["numero_equivocado"];
const esContacto = (h: any) => !!h && (h.tipo === "llamada" || h.tipo === "estado" || h.tipo === "cita");

// Fecha ISO del último contacto real (historial o notas). "" si nunca.
export function lastContactAt(rec: any): string {
  let max = "";
  (rec?.historial || []).forEach((h: any) => { if (esContacto(h) && String(h.fecha || "") > max) max = String(h.fecha); });
  (rec?.notas || []).forEach((n: any) => { if (n && String(n.fecha || "") > max) max = String(n.fecha); });
  // referidos: el contacto vive dentro de cada referido del anfitrión
  (rec?.referidos || []).forEach((r: any) => { const f = lastContactAt(r); if (f > max) max = f; });
  return max;
}
export function daysSinceContact(rec: any, now: Date = new Date()): number | null {
  const f = lastContactAt(rec);
  if (!f) return null;
  const t = new Date(f).getTime();
  if (isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}
export const wasWorked = (rec: any) => !!lastContactAt(rec) || (!!rec?.estado && rec.estado !== "sin_estado");
export const isBlocked = (rec: any) =>
  !!rec?.eliminado || !!rec?.noContactar || !!rec?.recompra || ESTADOS_BLOQUEO.includes(rec?.estado);

export function deriveWorkStatus(rec: any): WorkStatus {
  if (isBlocked(rec)) return "blocked";
  if (!wasWorked(rec)) return "fresh";
  // Asignado, trabajado ANTES de esta asignación y aún sin tocar → es un recontacto pendiente.
  if (rec?.assignedTo && rec?.assignedAt && lastContactAt(rec) < rec.assignedAt) return "recontact";
  return "worked";
}

export type AssignFilters = {
  sinAsignar?: boolean;        // solo registros sin responsable
  deUsuario?: string;          // solo los que hoy tiene este uid (para retirar/reasignar)
  frescos?: boolean;           // nunca contactados
  yaContactados?: boolean;     // trabajados antes
  noContesto?: boolean;        // último estado: no contestó / buzón
  seguimientoVencido?: boolean;
  sinVenta?: boolean;
  diasSinContacto?: number;    // más de X días sin contacto
  ciudad?: string;
  zip?: string;
  estado?: string;             // color/estado del semáforo
  fuente?: string;             // tipo de base / campaña / fuente
  incluirBloqueados?: boolean;
};

const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const zip5 = (s: any) => String(s || "").replace(/\D/g, "").slice(0, 5);
const hoyISO = (now: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`; // día LOCAL (Texas), no UTC
};

export function matchesFilters(rec: any, f: AssignFilters = {}, now: Date = new Date()): boolean {
  if (!rec || typeof rec !== "object") return false;
  if (isBlocked(rec) && !f.incluirBloqueados) return false;
  if (f.sinAsignar && rec.assignedTo) return false;
  if (f.deUsuario && rec.assignedTo !== f.deUsuario) return false;
  if (f.frescos && wasWorked(rec)) return false;
  if (f.yaContactados && !wasWorked(rec)) return false;
  if (f.noContesto && !ESTADOS_NO_CONTESTO.includes(rec.estado)) return false;
  if (f.seguimientoVencido && !(rec.proximo_seguimiento && String(rec.proximo_seguimiento) < hoyISO(now))) return false;
  if (f.sinVenta && rec.venta === true) return false;
  if (typeof f.diasSinContacto === "number" && f.diasSinContacto > 0) {
    const d = daysSinceContact(rec, now);
    if (d === null || d <= f.diasSinContacto) return false;
  }
  if (f.ciudad && !norm(rec.ciudad || rec.anfitrion_ciudad).includes(norm(f.ciudad))) return false;
  if (f.zip && zip5(rec.cp) !== zip5(f.zip)) return false;
  if (f.estado && (rec.estado || "sin_estado") !== f.estado) return false;
  if (f.fuente && !norm(rec.fuente || rec.campana || rec.tipoBase).includes(norm(f.fuente))) return false;
  return true;
}

// Devuelve los primeros `cantidad` registros que cumplen (más antiguos sin contacto primero).
export function selectForAssignment(records: any[], f: AssignFilters, cantidad: number, now: Date = new Date()): any[] {
  const ok = (records || []).filter((r) => matchesFilters(r, f, now));
  ok.sort((a, b) => lastContactAt(a).localeCompare(lastContactAt(b)));
  return cantidad > 0 ? ok.slice(0, cantidad) : ok;
}

export type AssignOpts = {
  toUid: string; toName: string; byUid: string; type: AssignmentType;
  reason?: string; now?: Date;
  allowReassign?: boolean;              // reasignación EXPLÍCITA
  expectedAssignedTo?: string | null;   // candado contra choques entre dos supervisores
};
export type AssignResult = { record: any; changed: boolean; error: string };

function closeOpenEntries(hist: AssignmentEntry[], byUid: string, iso: string, reason: string): AssignmentEntry[] {
  return (hist || []).map((e) => (e && !e.unassignedAt ? { ...e, unassignedAt: iso, unassignedBy: byUid, reason: e.reason || reason } : e));
}

export function assignRecord(rec: any, o: AssignOpts): AssignResult {
  if (!rec || !o?.toUid) return { record: rec, changed: false, error: "Datos de asignación incompletos." };
  if (o.expectedAssignedTo !== undefined && (rec.assignedTo || null) !== (o.expectedAssignedTo || null)) {
    return { record: rec, changed: false, error: "Otra persona cambió este registro hace un momento. Actualiza e inténtalo de nuevo." };
  }
  if (rec.assignedTo === o.toUid) return { record: rec, changed: false, error: "" }; // ya es suyo: no duplica
  if (rec.assignedTo && !o.allowReassign) {
    return { record: rec, changed: false, error: `Ya está asignado a ${rec.assignedToName || "otro usuario"}. Usa "Reasignar".` };
  }
  const iso = (o.now || new Date()).toISOString();
  const reason = o.reason || (rec.assignedTo ? "reasignación" : "asignación");
  const hist = closeOpenEntries(rec.assignmentHistory || [], o.byUid, iso, "reasignado");
  const entry: AssignmentEntry = {
    userId: o.toUid, userName: o.toName, type: o.type, assignedBy: o.byUid,
    assignedAt: iso, unassignedAt: null, unassignedBy: null, reason,
  };
  const next = {
    ...rec,
    assignedTo: o.toUid, assignedToName: o.toName, assignedBy: o.byUid, assignedAt: iso,
    assignmentType: o.type, assignmentStatus: "assigned",
    assignmentHistory: [...hist, entry],
    asignado_a: o.toName, actualizado: iso,
  };
  // Foto del dato AL ASIGNARLO: fresco o recontacto (ya trabajado antes). No cambia hasta la próxima asignación.
  next.workStatus = isBlocked(rec) ? "blocked" : wasWorked(rec) ? "recontact" : "fresh";
  return { record: next, changed: true, error: "" };
}

export function unassignRecord(rec: any, o: { byUid: string; reason?: string; now?: Date }): AssignResult {
  if (!rec?.assignedTo) return { record: rec, changed: false, error: "" };
  const iso = (o.now || new Date()).toISOString();
  const next = {
    ...rec,
    assignedTo: null, assignedToName: "", assignedBy: o.byUid, assignedAt: iso,
    assignmentStatus: "unassigned",
    assignmentHistory: closeOpenEntries(rec.assignmentHistory || [], o.byUid, iso, o.reason || "retirado"),
    asignado_a: "", actualizado: iso,
  };
  next.workStatus = deriveWorkStatus(next);
  return { record: next, changed: true, error: "" };
}

// Asignación masiva. Devuelve SOLO los registros que cambiaron (para escribirlos por lotes).
export function bulkAssign(records: any[], o: AssignOpts): { changed: any[]; skipped: Array<{ id: string; error: string }> } {
  const changed: any[] = []; const skipped: Array<{ id: string; error: string }> = [];
  (records || []).forEach((r) => {
    const res = assignRecord(r, o);
    if (res.changed) changed.push(res.record);
    else if (res.error) skipped.push({ id: r?.id, error: res.error });
  });
  return { changed, skipped };
}

// Auditoría: ¿qué claves cambiaron entre antes y después? Debe ser subconjunto de TOUCHABLE.
export function changedKeys(before: any, after: any): string[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
}
export const onlyAssignmentChanged = (before: any, after: any) => changedKeys(before, after).every((k) => TOUCHABLE.has(k));

// Carga de trabajo por telemarketing.
export function workload(records: any[], appts: any[], uid: string, nombre: string) {
  const mios = (records || []).filter((r) => r && r.assignedTo === uid && !r.eliminado);
  const trabajadoDesdeAsignacion = (r: any) => !!r.assignedAt && lastContactAt(r) >= r.assignedAt;
  const trabajados = mios.filter(trabajadoDesdeAsignacion).length;
  const citas = (appts || []).filter((a) => a && !a.eliminado && (a.createdByUid === uid || a.assignedTo === uid || a.agente === nombre)).length;
  let ultima = "";
  mios.forEach((r) => { const f = lastContactAt(r); if (f > ultima) ultima = f; });
  return {
    asignados: mios.length,
    pendientes: mios.length - trabajados,
    trabajados,
    citas,
    ventas: mios.filter((r) => r.venta === true).length,
    recontactos: mios.filter((r) => r.workStatus === "recontact").length,
    ultimaActividad: ultima,
  };
}
