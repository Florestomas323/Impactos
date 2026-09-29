// ═══ ESQUEMA DEL MOTOR NUEVO — un documento por registro ═══════════════════
// workspaces/{appId}/records/{recId}   ← clientes, referidos, prospectos,
//                                        distribución, cobranza, reclutamiento
// workspaces/{appId}/appts/{apptId}    ← agenda
// workspaces/{appId}/shared/{docId}    ← config, incentivos, cofre, plantillas
// workspaces/{appId}/userData/{uid}/…  ← conteo de llamadas, cofres, leídos
// La SECCIÓN es un campo, no una colección: así un telemarketing de ventas
// trae sus 3 secciones con UNA consulta (assignedTo == uid).
import { AssignmentType } from "../auth/roles";

export const SECTIONS = ["agregados", "referidos", "prospectos", "distribucion", "cobranza", "reclutamiento"] as const;
export type Section = (typeof SECTIONS)[number];
export const isSection = (s: unknown): s is Section => SECTIONS.includes(s as Section);

export const MIGRATION_VERSION = 1;
export const LEGACY_SOURCE = "crm_telemarketing";

// Qué tipo de asignación corresponde a cada sección.
export const SECTION_ASSIGNMENT: Record<Section, AssignmentType> = {
  agregados: "ventas", referidos: "ventas", prospectos: "ventas",
  distribucion: "ventas", cobranza: "cobranza", reclutamiento: "reclutamiento",   // Distribución ES ventas
};

export type RecordDoc = {
  id: string;
  appId: string;
  section: Section;
  // trazabilidad del origen
  legacyId: string;
  legacySource: string;
  migratedAt: string | null;
  migrationVersion: number;
  linkedRecordId?: string | null; // cobranza → cliente de distribución
  // asignación
  assignedTo: string | null;
  assignedToName: string;
  assignedBy: string | null;
  assignedAt: string | null;
  lastAssignedAt: string | null;
  assignmentType: AssignmentType;
  assignmentStatus: "unassigned" | "assigned";
  assignmentHistory: any[];
  workStatus: "fresh" | "worked" | "recontact" | "blocked";
  // …y TODOS los campos comerciales originales, intactos
  [k: string]: any;
};

// Campos que el motor nuevo agrega. Todo lo demás del registro viejo se copia tal cual.
export const ENGINE_FIELDS = [
  "appId", "section", "legacyId", "legacySource", "migratedAt", "migrationVersion", "linkedRecordId",
  "assignedTo", "assignedToName", "assignedBy", "assignedAt", "lastAssignedAt",
  "assignmentType", "assignmentStatus", "assignmentHistory", "workStatus",
] as const;

export const docIdFor = (section: Section, legacyId: string) =>
  section === "cobranza" ? `cob_${legacyId}` : String(legacyId);

// ── Datos que NO son registros ──────────────────────────────────────────────
// Claves del estado viejo que pertenecen al sistema de acceso anterior: no se
// migran ni se sincronizan en el sistema nuevo (users/ e invitations/ las reemplazan).
export const LEGACY_AUTH_KEYS = ["cuentasCustom", "usuariosCustom", "preguntasSeguridad"];
// Respaldos completos del estado viejo: pueden pesar más de 1 MB (límite de un
// documento de Firestore). Quedan en crm_telemarketing, que no se borra nunca.
export const LOCAL_ONLY_KEYS = ["respaldos"];
// Claves con tratamiento propio en el store.
export const RECORD_KEYS = ["agregados", "referidos", "prospectos", "distribucion", "reclutamiento", "appts", "cobranza"];

// ¿Esta clave del estado va a workspaces/{appId}/shared/{clave}?
export function isSharedKey(k: string): boolean {
  return !!k && !k.startsWith("_") && !RECORD_KEYS.includes(k) && !LEGACY_AUTH_KEYS.includes(k) && !LOCAL_ONLY_KEYS.includes(k);
}
// Cobranza: la config (umbrales, meses, reportes…) va a shared/cobranza;
// cada cliente de clientesData es un registro (section "cobranza").
export const COBRANZA_SHARED_DOC = "cobranza";
// callLog: el histórico viejo queda en shared/callLog (solo lectura); lo nuevo
// de cada persona va a userData/{uid}.callLog. El store los suma para mostrar.
export const CALLLOG_KEY = "callLog";

// ── Consultas por rol ───────────────────────────────────────────────────────
// El telemarketing NUNCA descarga la base completa: una consulta por cada
// sección que su especialidad trabaja, siempre con assignedTo == su uid.
// (Así las Rules pueden verificar la consulta completa; ver firestore.rules.)
export const SECTIONS_FOR_ROLE: Record<string, Section[]> = {
  telemarketing_ventas: ["agregados", "referidos", "prospectos", "distribucion"],
  telemarketing_cobranza: ["cobranza"],
  telemarketing_reclutamiento: ["reclutamiento"],
};
export type QuerySpec = { collection: "records" | "appts"; where: Array<[string, string, any]> };
export function queriesFor(user: { role?: string; uid?: string } | null, col: "records" | "appts" = "records"): QuerySpec[] {
  if (!user?.role || !user?.uid) return [];
  const r = user.role;
  // Staff: toda su app, papelera incluida (la UI la necesita).
  if (r === "super_admin" || r === "distribuidor" || r === "supervisor") return [{ collection: col, where: [] }];
  if (col === "appts") {
    return [
      { collection: "appts", where: [["assignedTo", "==", user.uid]] },
      { collection: "appts", where: [["createdByUid", "==", user.uid]] },
    ];
  }
  return (SECTIONS_FOR_ROLE[r] || []).map((sec) => ({
    collection: "records" as const,
    where: [["assignedTo", "==", user.uid], ["section", "==", sec]] as Array<[string, string, any]>,
  }));
}

// ── Cobranza autosuficiente para llamar ─────────────────────────────────────
// Distribución (VENTAS) y Cobranza son especialidades distintas: la TLK de
// Cobranza NO recibe Distribución. Por eso cada cuenta de Cobranza enlazada
// (linkedRecordId) lleva COPIA de los datos mínimos de contacto del cliente.
// • Solo identidad/contacto: nada de ventas, notas ni historial comercial.
// • Nunca sobrescribe un dato que Cobranza ya tenga (cualquiera de sus variantes).
// • Se escribe con los nombres que lee la pantalla de Cobranza (nombre, tel,
//   nroCuenta, direccion, ciudad) y los de la bandeja (telefono, cuenta), + cp.
// linkedRecordId se conserva: es identidad del cliente, NO responsable ni cola.
const vacio = (v: any) => v === undefined || v === null || String(v).trim() === "";
export function completarContactoCobranza(cob: any, dist: any): { doc: any; campos: string[] } {
  if (!cob || !dist) return { doc: cob, campos: [] };
  const out: any = { ...cob }; const campos: string[] = [];
  const poner = (claves: string[], valor: any) => {
    if (vacio(valor) || claves.some((k) => !vacio(cob[k]))) return;
    claves.forEach((k) => { out[k] = valor; }); campos.push(...claves);
  };
  poner(["nombre"], dist.nombre);
  poner(["telefono", "tel"], dist.telefono || dist.telefonoMovil || dist.telefonoCasa);
  // Número de cuenta: solo si Cobranza no tiene NINGUNA variante (cuenta, nroCuenta, numeroCuenta).
  if (["cuenta", "nroCuenta", "numeroCuenta"].every((k) => vacio(cob[k])) && !vacio(dist.cuenta)) {
    out.cuenta = dist.cuenta; out.nroCuenta = dist.cuenta; campos.push("cuenta", "nroCuenta");
  }
  poner(["direccion"], dist.direccion);
  poner(["ciudad"], dist.ciudad);
  poner(["cp"], dist.cp);
  if (campos.length) out.contactoCopiadoDe = { section: "distribucion", id: String(dist.id ?? cob.linkedRecordId ?? ""), campos };
  return { doc: campos.length ? out : cob, campos };
}
