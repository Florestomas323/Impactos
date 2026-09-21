// ═══ MIGRADOR: crm_telemarketing → workspaces/{appId} ══════════════════════
// SOLO COPIA. No borra, no modifica y no sobrescribe nada del sistema viejo,
// ni pisa un documento nuevo que ya exista (por eso es idempotente).
import { Section, SECTIONS, SECTION_ASSIGNMENT, MIGRATION_VERSION, LEGACY_SOURCE, docIdFor, RecordDoc } from "../data/schema";
import { deriveWorkStatus } from "./assignments";

// El estado viejo vive partido en documentos sec_<seccion>_<n>. Esto lo vuelve
// a unir en un solo objeto (mismo criterio que usa App.tsx hoy).
export function joinLegacyDocs(docs: Record<string, any>): Record<string, any> {
  const estado: Record<string, any> = { ...(docs["sec_misc"] || {}) };
  const frags: Record<string, Array<[number, any]>> = {};
  Object.keys(docs || {}).forEach((id) => {
    if (id === "state" || id === "sec_misc") return;      // "state" = legado V0, solo respaldo
    const m = id.match(/^sec_(.+?)(?:_(\d+))?$/);
    if (!m) return;
    const sec = m[1], n = m[2] ? parseInt(m[2], 10) : 0;
    (frags[sec] = frags[sec] || []).push([n, docs[id]]);
  });
  Object.keys(frags).forEach((sec) => {
    const partes = frags[sec].sort((a, b) => a[0] - b[0]);
    // Si hay fragmentos numerados, los sin numerar son el respaldo viejo: se ignoran.
    const usar = partes.some(([n]) => n > 0) ? partes.filter(([n]) => n > 0) : partes;
    const vals = usar.map(([, v]) => v);
    if (vals.every((v) => Array.isArray(v))) estado[sec] = vals.flat();
    else estado[sec] = mergeFragObjects(vals);
  });
  return estado;
}

// Une fragmentos que son objetos. Un nivel de profundidad, porque cobranza
// reparte su mapa "clientesData" entre los 5 documentos (y la config solo va en el _1).
function mergeFragObjects(vals: any[]): any {
  const out: Record<string, any> = {};
  vals.forEach((v) => {
    if (!v || typeof v !== "object") return;
    Object.keys(v).forEach((k) => {
      const nuevo = v[k];
      const previo = out[k];
      const ambosMapa = previo && typeof previo === "object" && !Array.isArray(previo)
        && nuevo && typeof nuevo === "object" && !Array.isArray(nuevo);
      out[k] = ambosMapa ? { ...previo, ...nuevo } : nuevo;
    });
  });
  return out;
}

export type Counts = Record<string, number>;
// Inventario ANTES de migrar (y el mismo cálculo se usa para comparar DESPUÉS).
export function countLegacy(estado: any): { porSeccion: Counts; porEstado: Counts; total: number; notas: number; historial: number } {
  const porSeccion: Counts = {}, porEstado: Counts = {};
  let total = 0, notas = 0, historial = 0;
  const contar = (r: any, sec: string) => {
    porSeccion[sec] = (porSeccion[sec] || 0) + 1; total++;
    const e = r?.estado || "sin_estado";
    porEstado[e] = (porEstado[e] || 0) + 1;
    notas += (r?.notas || []).length;
    historial += (r?.historial || []).length;
    (r?.referidos || []).forEach((x: any) => { notas += (x?.notas || []).length; historial += (x?.historial || []).length; });
  };
  ["agregados", "referidos", "prospectos", "distribucion", "reclutamiento"].forEach((sec) => {
    (Array.isArray(estado?.[sec]) ? estado[sec] : []).forEach((r: any) => contar(r, sec));
  });
  const cd = estado?.cobranza?.clientesData || {};
  Object.keys(cd).forEach((k) => contar(cd[k], "cobranza"));
  return { porSeccion, porEstado, total, notas, historial };
}

// Convierte UN registro viejo en documento nuevo. Copia todo y solo AGREGA campos.
export function toRecordDoc(raw: any, section: Section, appId: string, nowISO: string, distIds?: Set<string>): RecordDoc {
  const legacyId = String(raw?.id ?? raw?.legacyId ?? "");
  const doc: any = {
    ...raw,                                   // ← todo el registro original, sin tocar
    id: docIdFor(section, legacyId),
    appId,
    section,
    legacyId,
    legacySource: LEGACY_SOURCE,
    migratedAt: nowISO,
    migrationVersion: MIGRATION_VERSION,
    eliminado: raw?.eliminado === true,
    assignedTo: raw?.assignedTo ?? null,
    assignedToName: raw?.assignedToName ?? raw?.asignado_a ?? "",
    assignedBy: raw?.assignedBy ?? null,
    assignedAt: raw?.assignedAt ?? null,
    lastAssignedAt: raw?.lastAssignedAt ?? raw?.assignedAt ?? null,
    assignmentType: raw?.assignmentType ?? SECTION_ASSIGNMENT[section],
    assignmentStatus: raw?.assignedTo ? "assigned" : "unassigned",
    assignmentHistory: Array.isArray(raw?.assignmentHistory) ? raw.assignmentHistory : [],
    actualizado: raw?.actualizado || raw?.creado || nowISO,
  };
  // "asignado_a" viejo guardaba un NOMBRE, no un uid: se conserva como referencia
  // histórica (responsable anterior) y NO se convierte en assignedTo.
  if (raw?.asignado_a && !raw?.assignedTo) doc.responsablePrevio = raw.asignado_a;
  if (section === "cobranza") doc.linkedRecordId = distIds?.has(legacyId) ? legacyId : null;
  doc.workStatus = deriveWorkStatus(doc);
  return doc as RecordDoc;
}

export type Plan = { records: RecordDoc[]; appts: any[]; shared: Record<string, any>; warnings: string[] };

// Construye TODO lo que se va a escribir, sin escribir nada todavía.
export function planMigration(estado: any, appId: string, now: Date = new Date()): Plan {
  const nowISO = now.toISOString();
  const warnings: string[] = [];
  const records: RecordDoc[] = [];
  const vistos = new Set<string>();
  const distIds = new Set<string>((Array.isArray(estado?.distribucion) ? estado.distribucion : []).map((d: any) => String(d?.id)));

  const push = (raw: any, sec: Section) => {
    const legacyId = String(raw?.id ?? "");
    if (!legacyId) { warnings.push(`${sec}: registro sin id — se omite (revísalo a mano)`); return; }
    const doc = toRecordDoc(raw, sec, appId, nowISO, distIds);
    if (vistos.has(doc.id)) { warnings.push(`${sec}: id repetido ${legacyId} — se omite la copia`); return; }
    vistos.add(doc.id); records.push(doc);
  };
  (SECTIONS as readonly string[]).forEach((sec) => {
    if (sec === "cobranza") return;
    (Array.isArray(estado?.[sec]) ? estado[sec] : []).forEach((r: any) => push(r, sec as Section));
  });
  const cd = estado?.cobranza?.clientesData || {};
  Object.keys(cd).forEach((k) => push({ ...(cd[k] || {}), id: k }, "cobranza"));

  const appts = (Array.isArray(estado?.appts) ? estado.appts : []).map((a: any) => ({
    ...a, appId, legacyId: String(a?.id ?? ""), legacySource: LEGACY_SOURCE,
    migratedAt: nowISO, migrationVersion: MIGRATION_VERSION,
    assignedTo: a?.assignedTo ?? null, createdByUid: a?.createdByUid ?? null,
    eliminado: a?.eliminado === true,
  })).filter((a: any) => a.legacyId);

  // Config y catálogos compartidos: viajan completos, fuera de los registros.
  const cobranzaResto: any = { ...(estado?.cobranza || {}) };
  delete cobranzaResto.clientesData;
  const shared: Record<string, any> = {
    cobranzaConfig: cobranzaResto,
    incentivos: estado?.incentivos || [],
    cofre: { config: estado?.cofreConfig || {}, aperturas: estado?.cofreAperturas || [] },
    catalogo: estado?.catalogoCustom || {},
    cumpleanos: estado?.cumpleanos || [],
    rutas: estado?.rutas || [],
    controlCierres: estado?.controlCierres || [],
    socios: estado?.socios || [],
    plantillas: { cumpleMsgTpl: estado?.cumpleMsgTpl || "" },
    callLogLegacy: estado?.callLog || {},
  };
  return { records, appts, shared, warnings };
}

// Compara inventario de origen contra lo planeado/escrito.
export type Report = {
  appId: string; fecha: string; version: number;
  antes: Counts; despues: Counts; diferencia: Counts;
  totalAntes: number; totalDespues: number;
  notasAntes: number; notasDespues: number;
  historialAntes: number; historialDespues: number;
  duplicados: number; perdidos: string[];
  cobranzaEnlazados: number; huerfanosCobranza: number; sinIdValido: number;
  ok: boolean; warnings: string[];
};
export function verifyMigration(estado: any, plan: Plan, appId: string, now: Date = new Date()): Report {
  const antes = countLegacy(estado);
  const despues: Counts = {}; let notasD = 0, histD = 0;
  const ids = new Set<string>(); let duplicados = 0;
  plan.records.forEach((r) => {
    despues[r.section] = (despues[r.section] || 0) + 1;
    if (ids.has(r.id)) duplicados++; else ids.add(r.id);
    notasD += (r.notas || []).length; histD += (r.historial || []).length;
    (r.referidos || []).forEach((x: any) => { notasD += (x?.notas || []).length; histD += (x?.historial || []).length; });
  });
  const diferencia: Counts = {};
  new Set([...Object.keys(antes.porSeccion), ...Object.keys(despues)]).forEach((k) => {
    diferencia[k] = (despues[k] || 0) - (antes.porSeccion[k] || 0);
  });
  // ¿Algún id de origen no llegó?
  const perdidos: string[] = [];
  const check = (raw: any, sec: Section) => { if (raw?.id && !ids.has(docIdFor(sec, String(raw.id)))) perdidos.push(`${sec}:${raw.id}`); };
  (SECTIONS as readonly string[]).forEach((sec) => {
    if (sec === "cobranza") return;
    (Array.isArray(estado?.[sec]) ? estado[sec] : []).forEach((r: any) => check(r, sec as Section));
  });
  const cd = estado?.cobranza?.clientesData || {};
  Object.keys(cd).forEach((k) => check({ id: k }, "cobranza"));

  const ok = duplicados === 0 && perdidos.length === 0 &&
    Object.values(diferencia).every((d) => d === 0) &&
    notasD >= antes.notas && histD >= antes.historial;
  return {
    appId, fecha: now.toISOString(), version: MIGRATION_VERSION,
    antes: antes.porSeccion, despues, diferencia,
    totalAntes: antes.total, totalDespues: plan.records.length,
    notasAntes: antes.notas, notasDespues: notasD,
    historialAntes: antes.historial, historialDespues: histD,
    duplicados, perdidos,
    cobranzaEnlazados: plan.records.filter((r) => r.section === "cobranza" && !!r.linkedRecordId).length,
    huerfanosCobranza: plan.records.filter((r) => r.section === "cobranza" && !r.linkedRecordId).length,
    sinIdValido: plan.warnings.filter((w) => w.includes("sin id")).length,
    ok, warnings: plan.warnings,
  };
}

export function formatReport(r: Report): string {
  const L: string[] = [];
  L.push(`REPORTE DE MIGRACIÓN — ${r.appId} — ${r.fecha} (v${r.version})`);
  L.push("");
  L.push("Sección           Antes   Después   Dif");
  Object.keys({ ...r.antes, ...r.despues }).sort().forEach((k) => {
    L.push(`${k.padEnd(16)} ${String(r.antes[k] || 0).padStart(6)} ${String(r.despues[k] || 0).padStart(9)} ${String(r.diferencia[k] || 0).padStart(5)}`);
  });
  L.push(`${"TOTAL".padEnd(16)} ${String(r.totalAntes).padStart(6)} ${String(r.totalDespues).padStart(9)} ${String(r.totalDespues - r.totalAntes).padStart(5)}`);
  L.push("");
  L.push(`Notas:     ${r.notasAntes} → ${r.notasDespues}`);
  L.push(`Historial: ${r.historialAntes} → ${r.historialDespues}`);
  L.push("");
  L.push(`Duplicados detectados:          ${r.duplicados}`);
  L.push(`Registros sin ID válido:       ${r.sinIdValido}`);
  L.push(`Registros perdidos:            ${r.perdidos.length}${r.perdidos.length ? " → " + r.perdidos.slice(0, 20).join(", ") : ""}`);
  L.push(`Cobranza enlazada a Distribución: ${r.cobranzaEnlazados}`);
  L.push(`Cobranza sin linkedRecordId:      ${r.huerfanosCobranza} (normal: entradas del reporte Hy Cite sin cliente en la base)`);
  if (r.warnings.length) { L.push(""); L.push("Avisos:"); r.warnings.forEach((w) => L.push(" - " + w)); }
  L.push("");
  L.push(r.ok ? "RESULTADO: OK — cero pérdidas, cero duplicados." : "RESULTADO: REVISAR — no coinciden los conteos.");
  return L.join("\n");
}

// Mapa de roles viejos → nuevos (los usuarios se convierten en INVITACIONES).
export function mapLegacyRole(rolViejo: string, email: string, superEmail: string): string {
  if (String(email || "").trim().toLowerCase() === String(superEmail || "").trim().toLowerCase()) return "super_admin";
  const x = String(rolViejo || "").toLowerCase();
  if (x.includes("supervis")) return "supervisor";
  if (x.includes("distribuidor") || x.includes("administrador") || x === "admin") return "distribuidor";
  if (x.includes("cobran")) return "telemarketing_cobranza";
  if (x.includes("reclut")) return "telemarketing_reclutamiento";
  return "telemarketing_ventas";
}
