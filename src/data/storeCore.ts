// ═══ STORE NUEVO — LÓGICA PURA (sin Firebase, probada en tests/store.test.ts) ═
// Traduce entre:
//   documentos de Firestore  (records/, appts/, shared/, userData/)
//   ⇅
//   el "estado" que la app ya conoce (state.agregados, state.cobranza.clientesData…)
// Así los módulos existentes no se reescriben: reciben la MISMA forma de datos.
//
// Reglas de oro:
//  • Nunca normaliza datos comerciales: notas/historial/referidos/mensajes viajan
//    tal cual (texto, mapa o array), como se encontró en el dry-run.
//  • Los campos del motor (asignación, origen) jamás los escribe la app normal:
//    se toman SIEMPRE del documento actual. Solo el escritor de asignaciones los cambia.
import { ENGINE_FIELDS, SECTION_ASSIGNMENT, Section, COBRANZA_SHARED_DOC, CALLLOG_KEY, isSharedKey, docIdFor } from "./schema";
import { asList } from "../services/assignments";

export const LIST_KEYS: Section[] = ["agregados", "referidos", "prospectos", "distribucion", "reclutamiento"];
const STAFF = ["super_admin", "distribuidor", "supervisor"];

// Claves compartidas que también escribe alguien que no es staff (mismo mapa en firestore.rules).
const TODOS_TM = ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
export const SHARED_WRITERS: Record<string, string[]> = {
  // Las escribe cualquiera del equipo desde funciones que ya existen en la app:
  cofreAperturas: TODOS_TM,      // abrir cofres de incentivo
  notificaciones: TODOS_TM,      // avisos del equipo y "leído por"
  cumpleNotifs: TODOS_TM,        // evita repetir el aviso de cumpleaños
  socios: ["telemarketing_reclutamiento"],
  docsSocios: ["telemarketing_reclutamiento"],
  [COBRANZA_SHARED_DOC]: ["telemarketing_cobranza"],
};
export function canWriteShared(role: string, key: string): boolean {
  return STAFF.includes(role) || (SHARED_WRITERS[key] || []).includes(role);
}

export type Ctx = { uid: string; role: string; appId: string; nombre: string; nowISO?: string };
export type Docs = {
  records: Record<string, any>;   // docId → data
  appts: Record<string, any>;
  shared: Record<string, any>;    // clave → payload
  userData: Record<string, any>;  // uid → data
};
export const emptyDocs = (): Docs => ({ records: {}, appts: {}, shared: {}, userData: {} });

// Suma de conteos de llamadas {fecha: {agente: n}}.
export function mergeCallLogs(...logs: any[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  logs.forEach((log) => {
    if (!log || typeof log !== "object") return;
    Object.entries(log).forEach(([fecha, porAgente]: [string, any]) => {
      if (!porAgente || typeof porAgente !== "object") return;
      out[fecha] = out[fecha] || {};
      Object.entries(porAgente).forEach(([ag, n]) => { out[fecha][ag] = (out[fecha][ag] || 0) + (Number(n) || 0); });
    });
  });
  return out;
}

// ── Documentos → estado ─────────────────────────────────────────────────────
export function buildState(d: Docs, base: Record<string, any> = {}): Record<string, any> {
  const st: Record<string, any> = { ...base };
  LIST_KEYS.forEach((k) => { st[k] = []; });
  const clientesData: Record<string, any> = {};
  Object.values(d.records).forEach((doc: any) => {
    if (!doc || typeof doc !== "object") return;
    if (doc.section === "cobranza") {
      const key = String(doc.legacyId || String(doc.id || "").replace(/^cob_/, ""));
      clientesData[key] = { ...doc, id: key };     // la app conoce la entrada por su clave
    } else if (LIST_KEYS.includes(doc.section)) {
      st[doc.section].push(doc);
    }
  });
  // Orden estable: más recientes primero (como se mostraba hasta hoy al agregar arriba).
  LIST_KEYS.forEach((k) => st[k].sort((a: any, b: any) => String(b.creado || "").localeCompare(String(a.creado || ""))));
  st.appts = Object.values(d.appts).filter(Boolean);
  Object.entries(d.shared).forEach(([k, v]) => { if (k !== COBRANZA_SHARED_DOC && k !== CALLLOG_KEY && isSharedKey(k)) st[k] = v; });
  st.cobranza = { ...(d.shared[COBRANZA_SHARED_DOC] || {}), clientesData };
  st.callLog = mergeCallLogs(d.shared[CALLLOG_KEY], ...Object.values(d.userData).map((u: any) => u?.callLog));
  return st;
}

// ── Estado → operaciones de escritura ───────────────────────────────────────
export type Op =
  | { kind: "set"; col: "records" | "appts"; id: string; data: any }
  | { kind: "delete"; col: "records" | "appts"; id: string }
  | { kind: "shared"; key: string; data: any }
  | { kind: "userCallLog"; uid: string; callLog: any };
export type DiffResult = { ops: Op[]; blocked: string[] };

const same = (a: any, b: any) => a === b || JSON.stringify(a) === JSON.stringify(b);
// Firestore no admite undefined: se quitan igual que lo hacía el sistema viejo (JSON).
export const clean = (x: any) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
const pickEngine = (doc: any) => {
  const o: any = {};
  ENGINE_FIELDS.forEach((f) => { if (doc && doc[f] !== undefined) o[f] = doc[f]; });
  if (doc && doc.createdByUid !== undefined) o.createdByUid = doc.createdByUid;
  return o;
};
const isStaff = (ctx: Ctx) => STAFF.includes(ctx.role);

// Campos del motor para un registro NUEVO creado desde la app.
export function freshEngine(section: Section, id: string, ctx: Ctx): any {
  const tm = !isStaff(ctx);
  const now = ctx.nowISO || new Date().toISOString();
  return {
    appId: ctx.appId, section, legacyId: id, legacySource: "impactos-v2", migratedAt: null, migrationVersion: 0,
    linkedRecordId: null, createdByUid: ctx.uid,
    assignedTo: tm ? ctx.uid : null, assignedToName: tm ? ctx.nombre : "", assignedBy: tm ? ctx.uid : null,
    assignedAt: tm ? now : null, lastAssignedAt: tm ? now : null,
    assignmentType: SECTION_ASSIGNMENT[section], assignmentStatus: tm ? "assigned" : "unassigned",
    assignmentHistory: tm ? [{ userId: ctx.uid, userName: ctx.nombre, type: SECTION_ASSIGNMENT[section], assignedBy: ctx.uid, assignedAt: now, unassignedAt: null, unassignedBy: null, reason: "creado por el telemarketing" }] : [],
    workStatus: "fresh",
  };
}

// Registro de la app → documento a guardar. Los campos del motor salen del doc actual.
function toDoc(section: Section, appRec: any, current: any, ctx: Ctx, docId: string): any {
  const engine = current ? pickEngine(current) : freshEngine(section, docId, ctx);
  const out = { ...clean(appRec), ...engine, id: docId, appId: ctx.appId, section };
  if (section === "cobranza") out.legacyId = current?.legacyId ?? String(docId).replace(/^cob_/, "");
  return out;
}

function diffList(section: Section, prev: any[], next: any[], d: Docs, ctx: Ctx, ops: Op[], blocked: string[]) {
  const P = new Map<string, any>(); asList(prev).forEach((r) => r && r.id != null && P.set(String(r.id), r));
  const N = new Map<string, any>(); asList(next).forEach((r) => r && r.id != null && N.set(String(r.id), r));
  N.forEach((rec, id) => {
    const old = P.get(id);
    if (old === rec) return;                       // misma referencia: no cambió
    if (old && same(old, rec)) return;
    ops.push({ kind: "set", col: "records", id, data: toDoc(section, rec, d.records[id], ctx, id) });
  });
  P.forEach((_, id) => {
    if (N.has(id)) return;
    if (["super_admin", "distribuidor"].includes(ctx.role)) ops.push({ kind: "delete", col: "records", id });
    else blocked.push(`${section}:${id} (solo el distribuidor borra definitivamente)`);
  });
}

export function diffState(prev: any, next: any, d: Docs, ctx: Ctx): DiffResult {
  const ops: Op[] = []; const blocked: string[] = [];
  if (prev === next) return { ops, blocked };
  LIST_KEYS.forEach((k) => { if (prev?.[k] !== next?.[k]) diffList(k, prev?.[k], next?.[k], d, ctx, ops, blocked); });

  // Cobranza: clientesData → registros cob_<clave>; el resto → shared/cobranza
  if (prev?.cobranza !== next?.cobranza) {
    const pc = prev?.cobranza || {}, nc = next?.cobranza || {};
    const pcd = pc.clientesData || {}, ncd = nc.clientesData || {};
    if (pcd !== ncd) {
      Object.keys(ncd).forEach((key) => {
        if (pcd[key] === ncd[key] || (pcd[key] && same(pcd[key], ncd[key]))) return;
        const docId = docIdFor("cobranza", key);
        ops.push({ kind: "set", col: "records", id: docId, data: toDoc("cobranza", { ...ncd[key], id: key }, d.records[docId], ctx, docId) });
      });
      Object.keys(pcd).forEach((key) => {
        if (key in ncd) return;
        if (["super_admin", "distribuidor"].includes(ctx.role)) ops.push({ kind: "delete", col: "records", id: docIdFor("cobranza", key) });
        else blocked.push(`cobranza:${key} (solo el distribuidor borra definitivamente)`);
      });
    }
    const { clientesData: _a, ...pr } = pc; const { clientesData: _b, ...nr } = nc;
    if (!same(pr, nr)) {
      if (canWriteShared(ctx.role, COBRANZA_SHARED_DOC)) ops.push({ kind: "shared", key: COBRANZA_SHARED_DOC, data: clean(nr) });
      else blocked.push("configuración de cobranza");
    }
  }

  // Agenda
  if (prev?.appts !== next?.appts) {
    const P = new Map<string, any>(); asList(prev?.appts).forEach((a) => a && a.id != null && P.set(String(a.id), a));
    asList(next?.appts).forEach((a) => {
      if (!a || a.id == null) return;
      const id = String(a.id), old = P.get(id);
      if (old === a || (old && same(old, a))) return;
      const cur = d.appts[id];
      ops.push({ kind: "set", col: "appts", id, data: {
        ...clean(a), id, appId: ctx.appId,
        createdByUid: cur?.createdByUid ?? ctx.uid, assignedTo: cur?.assignedTo ?? null,
        eliminado: a.eliminado === true,
      } });
    });
    P.forEach((_, id) => {
      if (asList(next?.appts).some((a) => a && String(a.id) === id)) return;
      if (["super_admin", "distribuidor"].includes(ctx.role)) ops.push({ kind: "delete", col: "appts", id });
      else blocked.push(`cita ${id} (solo el distribuidor borra definitivamente)`);
    });
  }

  // callLog: solo se guarda la PARTE de quien está usando la app, en su userData.
  if (prev?.callLog !== next?.callLog) {
    const mine = { ...((d.userData[ctx.uid] || {}).callLog || {}) };
    let cambio = false;
    Object.entries(next?.callLog || {}).forEach(([fecha, porAg]: [string, any]) => {
      const antes = Number(prev?.callLog?.[fecha]?.[ctx.nombre] || 0);
      const ahora = Number(porAg?.[ctx.nombre] || 0);
      if (ahora !== antes) {
        mine[fecha] = { ...(mine[fecha] || {}), [ctx.nombre]: Math.max(0, Number(mine[fecha]?.[ctx.nombre] || 0) + (ahora - antes)) };
        cambio = true;
      }
    });
    if (cambio) ops.push({ kind: "userCallLog", uid: ctx.uid, callLog: mine });
  }

  // Resto de claves compartidas
  new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]).forEach((k) => {
    if (!isSharedKey(k) || k === CALLLOG_KEY || k === COBRANZA_SHARED_DOC) return;
    if (prev?.[k] === next?.[k] || same(prev?.[k], next?.[k])) return;
    if (canWriteShared(ctx.role, k)) ops.push({ kind: "shared", key: k, data: clean(next?.[k]) });
    else blocked.push(k);
  });
  return { ops, blocked };
}
