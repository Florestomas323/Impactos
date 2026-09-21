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
  distribucion: "cobranza", cobranza: "cobranza", reclutamiento: "reclutamiento",
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

// Consultas por rol. El telemarketing NUNCA descarga la base completa.
export type QuerySpec = { collection: "records" | "appts"; where: Array<[string, string, any]>; orderBy?: string };
export function queryFor(user: { role?: string; uid?: string; appId?: string } | null, col: "records" | "appts" = "records"): QuerySpec | null {
  if (!user?.role) return null;
  const r = user.role;
  if (r === "super_admin" || r === "distribuidor" || r === "supervisor") {
    return { collection: col, where: [["eliminado", "==", false]], orderBy: "actualizado" };
  }
  if (r.startsWith("telemarketing_")) {
    return { collection: col, where: [["assignedTo", "==", user.uid], ["eliminado", "==", false]], orderBy: "actualizado" };
  }
  return null;
}
