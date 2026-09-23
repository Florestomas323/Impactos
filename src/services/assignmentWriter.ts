// ═══ ESCRITOR DE ASIGNACIONES ══════════════════════════════════════════════
// Único lugar que cambia responsables. Usa TRANSACCIONES y escribe SOLO los
// campos de asignación con update(): notas, mensajes, historial, llamadas,
// citas y seguimientos no viajan en la escritura, así que es imposible pisarlos.
import { assignRecord, unassignRecord, AssignOpts, ASSIGNMENT_FIELDS } from "./assignments";
import { AssignmentType } from "../auth/roles";

const WRITE_FIELDS = [...ASSIGNMENT_FIELDS, "lastAssignedAt", "asignado_a", "actualizado"];
const LOTE = 200;

export type Action =
  | { kind: "assign"; toUid: string; toName: string; type: AssignmentType; reason?: string; allowReassign?: boolean; via?: "manual" | "automatica" }
  | { kind: "unassign"; reason?: string };
export type WriteSummary = { ok: number; skipped: Array<{ id: string; error: string }>; failedBatches: number };

// Solo los campos de asignación del resultado.
export function assignmentPatch(after: any): any {
  const p: any = {};
  WRITE_FIELDS.forEach((f) => { if (f !== "lastAssignedAt" && after[f] !== undefined) p[f] = after[f]; });
  // lastAssignedAt solo avanza cuando hay un responsable nuevo (retirar no la toca).
  if (after.assignedTo && after.assignedAt) p.lastAssignedAt = after.assignedAt;
  return p;
}

// Calcula el cambio a partir del documento LEÍDO DENTRO de la transacción.
export function planOne(current: any, action: Action, byUid: string, now: Date, expectedAssignedTo: string | null | undefined) {
  if (action.kind === "unassign") {
    if (expectedAssignedTo !== undefined && (current.assignedTo || null) !== (expectedAssignedTo || null)) {
      return { changed: false, error: "Otra persona cambió este registro hace un momento.", record: current };
    }
    return unassignRecord(current, { byUid, reason: action.reason, now });
  }
  const o: AssignOpts = { toUid: action.toUid, toName: action.toName, byUid, type: action.type, reason: action.reason, now, allowReassign: action.allowReassign, expectedAssignedTo, via: action.via };
  return assignRecord(current, o);
}

// db = firestore compat; ids = docIds; expected = lo que la pantalla creía (candado anti-choque).
export async function applyAssignments(db: any, appId: string, items: Array<{ id: string; expectedAssignedTo?: string | null }>, action: Action, byUid: string): Promise<WriteSummary> {
  const col = db.collection("workspaces").doc(appId).collection("records");
  const sum: WriteSummary = { ok: 0, skipped: [], failedBatches: 0 };
  for (let i = 0; i < items.length; i += LOTE) {
    const tramo = items.slice(i, i + LOTE);
    try {
      // Firestore puede repetir la transacción si hubo choque: los contadores
      // se recalculan en cada intento y solo se suman al confirmar.
      let ok = 0; let skipped: Array<{ id: string; error: string }> = [];
      await db.runTransaction(async (t: any) => {
        ok = 0; skipped = [];
        const snaps = await Promise.all(tramo.map((it) => t.get(col.doc(it.id))));
        const now = new Date();
        snaps.forEach((snap: any, k: number) => {
          const it = tramo[k];
          if (!snap.exists) { skipped.push({ id: it.id, error: "ya no existe" }); return; }
          const res = planOne({ id: it.id, ...snap.data() }, action, byUid, now, it.expectedAssignedTo);
          if (!res.changed) { if (res.error) skipped.push({ id: it.id, error: res.error }); return; }
          t.update(col.doc(it.id), assignmentPatch(res.record));
          ok++;
        });
      });
      sum.ok += ok; sum.skipped.push(...skipped);
    } catch (e: any) {
      sum.failedBatches++;
      tramo.forEach((it) => sum.skipped.push({ id: it.id, error: String(e?.message || e) }));
    }
  }
  return sum;
}
