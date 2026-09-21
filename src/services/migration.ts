// ═══ MIGRADOR: crm_telemarketing → workspaces/{appId} ══════════════════════
// SOLO COPIA. No borra, no modifica y no sobrescribe nada del sistema viejo,
// ni pisa un documento nuevo que ya exista (por eso es idempotente).
//
// Formatos históricos: historial/notas/referidos/mensajes y hasta secciones
// enteras pueden venir como array, como mapa {id: item}, como texto o null.
// Aquí se LEEN de forma segura (asList) para contar y calcular, pero el valor
// original viaja al registro nuevo EXACTAMENTE como estaba. Cada forma
// inesperada queda anotada en los avisos del reporte: nada se oculta.
import { Section, SECTIONS, SECTION_ASSIGNMENT, MIGRATION_VERSION, LEGACY_SOURCE, docIdFor, RecordDoc, isSharedKey, COBRANZA_SHARED_DOC } from "../data/schema";
import { deriveWorkStatus, asList, asEntries, shapeOf } from "./assignments";

const LIST_SECTIONS: Section[] = ["agregados", "referidos", "prospectos", "distribucion", "reclutamiento"];
// Campos que el código actual espera como lista.
const LIST_FIELDS = ["historial", "notas", "referidos", "mensajes"] as const;
const NESTED_FIELDS = ["historial", "notas"] as const; // dentro de cada referido

// ── Avisos de forma ─────────────────────────────────────────────────────────
export type ShapeWarning = { section: string; id: string; field: string; type: string };
export const shapeWarningText = (w: ShapeWarning) =>
  `forma inesperada — sección ${w.section}, registro ${w.id}, campo ${w.field}: es ${w.type}, se esperaba array (se conserva tal cual)`;

// Revisa UN registro sin tocarlo. null/undefined = "no tiene": no es aviso.
export function inspectShape(rec: any, section: string, id: string): ShapeWarning[] {
  const out: ShapeWarning[] = [];
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) {
    out.push({ section, id, field: "(registro)", type: shapeOf(rec) });
    return out;
  }
  LIST_FIELDS.forEach((f) => {
    const v = rec[f];
    if (v !== undefined && v !== null && !Array.isArray(v)) out.push({ section, id, field: f, type: shapeOf(v) });
  });
  asEntries(rec.referidos).forEach(([k, r]) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      out.push({ section, id, field: `referidos[${k}]`, type: shapeOf(r) });
      return;
    }
    NESTED_FIELDS.forEach((f) => {
      const v = r[f];
      if (v !== undefined && v !== null && !Array.isArray(v)) out.push({ section, id, field: `referidos[${k}].${f}`, type: shapeOf(v) });
    });
  });
  return out;
}

// ── Rearmado del estado fragmentado ─────────────────────────────────────────
// El estado viejo vive partido en sec_<seccion>_<n>. Esto lo vuelve a unir en
// un solo objeto (mismo criterio que usa App.tsx hoy).
export function joinLegacyDocs(docs: Record<string, any>, warnings: string[] = []): Record<string, any> {
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
    const vals = usar.map(([, v]) => v).filter((v) => v !== null && v !== undefined);
    if (!vals.length) { estado[sec] = []; return; }
    const arrays = vals.filter((v) => Array.isArray(v)).length;
    if (arrays === vals.length) estado[sec] = vals.flat();
    else if (arrays === 0) estado[sec] = mergeFragObjects(vals);
    else {
      // Mezcla de arrays y mapas en la misma sección: se juntan todos los items, se avisa.
      warnings.push(`sección ${sec}: fragmentos mezclados (${vals.map(shapeOf).join(", ")}) — se leen todos los items`);
      estado[sec] = vals.flatMap((v) => asList(v));
    }
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

// ── Recorrido único de los registros de origen ──────────────────────────────
// La MISMA función alimenta el inventario, el plan y la verificación, para que
// ningún registro se cuente en un lado y se salte en otro.
export type SourceItem = { section: Section; raw: any; key: string };
export function sourceItems(estado: any, warnings?: string[]): SourceItem[] {
  const out: SourceItem[] = [];
  LIST_SECTIONS.forEach((sec) => {
    const v = estado?.[sec];
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      warnings?.push(`sección ${sec}: es ${shapeOf(v)}, se esperaba array — se leen sus items`);
    }
    asEntries(v).forEach(([key, raw]) => out.push({ section: sec, raw, key }));
  });
  const cd = estado?.cobranza?.clientesData;
  if (cd !== undefined && cd !== null && (typeof cd !== "object" || Array.isArray(cd))) {
    warnings?.push(`cobranza.clientesData: es ${shapeOf(cd)}, se esperaba mapa — se leen sus items`);
  }
  asEntries(cd).forEach(([key, raw]) => out.push({ section: "cobranza", raw, key }));
  return out;
}
// Id de origen: el del registro; en cobranza (y en secciones guardadas como mapa)
// la clave del mapa ES el id original.
function legacyIdOf(it: SourceItem, estado: any): string {
  if (it.section === "cobranza") return it.key;
  const esMapa = !Array.isArray(estado?.[it.section]);
  const own = it.raw && typeof it.raw === "object" ? it.raw.id : undefined;
  if (own !== undefined && own !== null && String(own) !== "") return String(own);
  return esMapa ? it.key : "";
}

// ── Conteos de notas/historial (lectura segura, anidados incluidos) ─────────
function countNested(r: any): { notas: number; historial: number } {
  let notas = asList(r?.notas).length, historial = asList(r?.historial).length;
  asList(r?.referidos).forEach((x: any) => {
    if (!x || typeof x !== "object") return;
    notas += asList(x.notas).length; historial += asList(x.historial).length;
  });
  return { notas, historial };
}

export type Counts = Record<string, number>;
// Inventario ANTES de migrar.
export function countLegacy(estado: any): { porSeccion: Counts; porEstado: Counts; total: number; notas: number; historial: number } {
  const porSeccion: Counts = {}, porEstado: Counts = {};
  let total = 0, notas = 0, historial = 0;
  sourceItems(estado).forEach(({ section, raw }) => {
    porSeccion[section] = (porSeccion[section] || 0) + 1; total++;
    const e = (raw && typeof raw === "object" && raw.estado) || "sin_estado";
    porEstado[e] = (porEstado[e] || 0) + 1;
    const c = countNested(raw); notas += c.notas; historial += c.historial;
  });
  return { porSeccion, porEstado, total, notas, historial };
}

// Convierte UN registro viejo en documento nuevo. Copia todo y solo AGREGA campos.
export function toRecordDoc(raw: any, section: Section, appId: string, nowISO: string, distIds?: Set<string>, legacyIdForzado?: string): RecordDoc {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : { valorOriginal: raw };
  const legacyId = String(legacyIdForzado ?? src.id ?? src.legacyId ?? "");
  const doc: any = {
    ...src,                                   // ← todo el registro original, sin tocar
    id: docIdFor(section, legacyId),
    appId,
    section,
    legacyId,
    legacySource: LEGACY_SOURCE,
    migratedAt: nowISO,
    migrationVersion: MIGRATION_VERSION,
    eliminado: src.eliminado === true,
    assignedTo: src.assignedTo ?? null,
    assignedToName: src.assignedToName ?? src.asignado_a ?? "",
    assignedBy: src.assignedBy ?? null,
    assignedAt: src.assignedAt ?? null,
    lastAssignedAt: src.lastAssignedAt ?? src.assignedAt ?? null,
    assignmentType: src.assignmentType ?? SECTION_ASSIGNMENT[section],
    assignmentStatus: src.assignedTo ? "assigned" : "unassigned",
    // Campo NUEVO del motor: si viniera con otra forma, el original se guarda aparte.
    assignmentHistory: Array.isArray(src.assignmentHistory) ? src.assignmentHistory : [],
    actualizado: src.actualizado || src.creado || nowISO,
  };
  if (src.assignmentHistory !== undefined && !Array.isArray(src.assignmentHistory)) {
    doc.assignmentHistoryOriginal = src.assignmentHistory;
  }
  // "asignado_a" viejo guardaba un NOMBRE, no un uid: se conserva como referencia
  // histórica (responsable anterior) y NO se convierte en assignedTo.
  if (src.asignado_a && !src.assignedTo) doc.responsablePrevio = src.asignado_a;
  if (section === "cobranza") doc.linkedRecordId = distIds?.has(legacyId) ? legacyId : null;
  doc.workStatus = deriveWorkStatus(doc);
  return doc as RecordDoc;
}

export type Plan = { records: RecordDoc[]; appts: any[]; shared: Record<string, any>; warnings: string[]; shapeWarnings: ShapeWarning[]; sinId: number };

// Construye TODO lo que se va a escribir, sin escribir nada todavía.
export function planMigration(estado: any, appId: string, now: Date = new Date(), joinWarnings: string[] = []): Plan {
  const nowISO = now.toISOString();
  const warnings: string[] = [...joinWarnings];
  const shapeWarnings: ShapeWarning[] = [];
  const records: RecordDoc[] = [];
  const vistos = new Set<string>();
  let sinId = 0;
  const items = sourceItems(estado, warnings);
  const distIds = new Set<string>(items.filter((i) => i.section === "distribucion").map((i) => legacyIdOf(i, estado)).filter(Boolean));

  items.forEach((it) => {
    const legacyId = legacyIdOf(it, estado);
    if (!legacyId) {
      sinId++;
      warnings.push(`${it.section}: registro sin id en la posición ${it.key} — se omite (revísalo a mano)`);
      return;
    }
    shapeWarnings.push(...inspectShape(it.raw, it.section, legacyId));
    const doc = toRecordDoc(it.raw, it.section, appId, nowISO, distIds, legacyId);
    if (vistos.has(doc.id)) { warnings.push(`${it.section}: id repetido ${legacyId} — se omite la copia`); return; }
    vistos.add(doc.id); records.push(doc);
  });

  const apptsRaw = estado?.appts;
  if (apptsRaw !== undefined && apptsRaw !== null && !Array.isArray(apptsRaw)) {
    warnings.push(`sección appts: es ${shapeOf(apptsRaw)}, se esperaba array — se leen sus items`);
  }
  const appts = asEntries(apptsRaw).map(([key, a]) => {
    const src = a && typeof a === "object" && !Array.isArray(a) ? a : { valorOriginal: a };
    const legacyId = String(src.id ?? (Array.isArray(apptsRaw) ? "" : key));
    return {
      ...src, id: legacyId, appId, legacyId, legacySource: LEGACY_SOURCE,
      migratedAt: nowISO, migrationVersion: MIGRATION_VERSION,
      assignedTo: src.assignedTo ?? null, createdByUid: src.createdByUid ?? null,
      eliminado: src.eliminado === true,
    };
  }).filter((a: any) => {
    if (a.legacyId) return true;
    warnings.push("appts: cita sin id — se omite (revísala a mano)");
    return false;
  });

  // Todo lo que no es registro va a shared/{clave} con el MISMO nombre que usa
  // la app (así el store nuevo lo lee sin traducir). Cobranza: su config sin clientesData.
  const shared: Record<string, any> = {};
  Object.keys(estado || {}).forEach((k) => { if (isSharedKey(k)) shared[k] = estado[k]; });
  const cobranzaResto: any = { ...(estado?.cobranza && typeof estado.cobranza === "object" ? estado.cobranza : {}) };
  delete cobranzaResto.clientesData;
  shared[COBRANZA_SHARED_DOC] = cobranzaResto;
  return { records, appts, shared, warnings, shapeWarnings, sinId };
}

// ── Verificación: origen contra lo planeado ─────────────────────────────────
export type Report = {
  appId: string; fecha: string; version: number;
  antes: Counts; despues: Counts; diferencia: Counts;
  totalAntes: number; totalDespues: number;
  notasAntes: number; notasDespues: number;
  historialAntes: number; historialDespues: number;
  duplicados: number; perdidos: string[];
  cobranzaEnlazados: number; huerfanosCobranza: number; sinIdValido: number;
  citas: number;
  ok: boolean; warnings: string[]; shapeWarnings: ShapeWarning[];
};
export function verifyMigration(estado: any, plan: Plan, appId: string, now: Date = new Date()): Report {
  const antes = countLegacy(estado);
  const despues: Counts = {}; let notasD = 0, histD = 0;
  const ids = new Set<string>(); let duplicados = 0;
  plan.records.forEach((r) => {
    despues[r.section] = (despues[r.section] || 0) + 1;
    if (ids.has(r.id)) duplicados++; else ids.add(r.id);
    const c = countNested(r); notasD += c.notas; histD += c.historial;
  });
  // Los registros sin id no se migran: se descuentan del "antes" esperado y se reportan aparte.
  const sinIdPorSeccion: Counts = {};
  sourceItems(estado).forEach((it) => { if (!legacyIdOf(it, estado)) sinIdPorSeccion[it.section] = (sinIdPorSeccion[it.section] || 0) + 1; });
  const diferencia: Counts = {};
  new Set([...Object.keys(antes.porSeccion), ...Object.keys(despues)]).forEach((k) => {
    diferencia[k] = (despues[k] || 0) - ((antes.porSeccion[k] || 0) - (sinIdPorSeccion[k] || 0));
  });
  // ¿Algún id de origen no llegó?
  const perdidos: string[] = [];
  sourceItems(estado).forEach((it) => {
    const lid = legacyIdOf(it, estado);
    if (lid && !ids.has(docIdFor(it.section, lid))) perdidos.push(`${it.section}:${lid}`);
  });

  const ok = duplicados === 0 && perdidos.length === 0 &&
    Object.values(diferencia).every((d) => d === 0) &&
    notasD >= antes.notas - 0 && histD >= antes.historial - 0 &&
    plan.sinId === 0;
  return {
    appId, fecha: now.toISOString(), version: MIGRATION_VERSION,
    antes: antes.porSeccion, despues, diferencia,
    totalAntes: antes.total, totalDespues: plan.records.length,
    notasAntes: antes.notas, notasDespues: notasD,
    historialAntes: antes.historial, historialDespues: histD,
    duplicados, perdidos,
    cobranzaEnlazados: plan.records.filter((r) => r.section === "cobranza" && !!r.linkedRecordId).length,
    huerfanosCobranza: plan.records.filter((r) => r.section === "cobranza" && !r.linkedRecordId).length,
    sinIdValido: plan.sinId,
    citas: plan.appts.length,
    ok, warnings: plan.warnings, shapeWarnings: plan.shapeWarnings,
  };
}

export function formatReport(r: Report, maxDetalle = 300): string {
  const L: string[] = [];
  L.push(`REPORTE DE MIGRACIÓN — ${r.appId} — ${r.fecha} (v${r.version})`);
  L.push("");
  L.push("Sección           Antes   Después   Dif");
  Object.keys({ ...r.antes, ...r.despues }).sort().forEach((k) => {
    L.push(`${k.padEnd(16)} ${String(r.antes[k] || 0).padStart(6)} ${String(r.despues[k] || 0).padStart(9)} ${String(r.diferencia[k] || 0).padStart(5)}`);
  });
  L.push(`${"TOTAL".padEnd(16)} ${String(r.totalAntes).padStart(6)} ${String(r.totalDespues).padStart(9)} ${String(r.totalDespues - r.totalAntes).padStart(5)}`);
  L.push(`Citas (agenda): ${r.citas}`);
  L.push("");
  L.push(`Notas:     ${r.notasAntes} → ${r.notasDespues}`);
  L.push(`Historial: ${r.historialAntes} → ${r.historialDespues}`);
  L.push("");
  L.push(`Duplicados detectados:          ${r.duplicados}`);
  L.push(`Registros sin ID válido:       ${r.sinIdValido}`);
  L.push(`Registros perdidos:            ${r.perdidos.length}${r.perdidos.length ? " → " + r.perdidos.slice(0, 20).join(", ") : ""}`);
  L.push(`Cobranza enlazada a Distribución: ${r.cobranzaEnlazados}`);
  L.push(`Cobranza sin linkedRecordId:      ${r.huerfanosCobranza} (normal: entradas del reporte Hy Cite sin cliente en la base)`);

  // Formas inesperadas: resumen agrupado + detalle por registro.
  if (r.shapeWarnings.length) {
    L.push("");
    L.push(`FORMAS INESPERADAS: ${r.shapeWarnings.length} (los valores se conservan exactamente como están)`);
    const grupos: Record<string, number> = {};
    r.shapeWarnings.forEach((w) => {
      const campo = w.field.replace(/\[[^\]]*\]/g, "[*]");
      const k = `${w.section} · ${campo} · ${w.type}`;
      grupos[k] = (grupos[k] || 0) + 1;
    });
    Object.entries(grupos).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => L.push(`  ${String(n).padStart(5)}  ${k}`));
    L.push("");
    L.push("Detalle (sección | registro | campo | tipo):");
    r.shapeWarnings.slice(0, maxDetalle).forEach((w) => L.push(`  ${w.section} | ${w.id} | ${w.field} | ${w.type}`));
    if (r.shapeWarnings.length > maxDetalle) L.push(`  … y ${r.shapeWarnings.length - maxDetalle} más`);
  }
  if (r.warnings.length) { L.push(""); L.push("Avisos:"); r.warnings.forEach((w) => L.push(" - " + w)); }
  L.push("");
  L.push(r.ok
    ? (r.shapeWarnings.length || r.warnings.length
        ? "RESULTADO: OK — cero pérdidas, cero duplicados. Hay avisos de formato: revísalos antes del --run."
        : "RESULTADO: OK — cero pérdidas, cero duplicados.")
    : "RESULTADO: REVISAR — no coinciden los conteos.");
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
