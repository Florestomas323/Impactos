// ═══ TRAZABILIDAD DE CITAS (solo ACCESS_V2) ════════════════════════════════
// Punto ÚNICO por el que pasan todas las citas nuevas de la app (Agenda,
// Llamadas, Reclutamiento, Servicios, cartuchos, fichas de cliente…), porque
// todas se crean con setAppts() de App.tsx.
//
//  • createdByUid / createdByName = quién la creó o agendó (identidad por uid,
//    nunca por nombre).
//  • assignedTo NO se toca: quien atiende la cita (p. ej. el distribuidor que
//    hará la visita) se decide aparte. El telemarketing la sigue viendo
//    porque createdByUid es suyo.
//  • Citas que ya existían no se modifican, aunque no traigan createdByUid.
import { asList } from "./assignments";

export type Autor = { uid: string; nombre: string };

export function enrichNewAppts(prev: any, next: any, autor: Autor | null): any {
  if (!autor?.uid || next === prev) return next;
  const lista = asList(next);
  const antes = new Set(asList(prev).filter(Boolean).map((a: any) => String(a.id)));
  let cambio = false;
  const out = lista.map((a: any) => {
    if (!a || a.id == null || antes.has(String(a.id)) || a.createdByUid) return a;
    cambio = true;
    return { ...a, createdByUid: autor.uid, createdByName: autor.nombre || "" };
  });
  return cambio ? out : next;
}

// ¿Esta cita es de esta persona? (la creó o se la asignaron)
export const esCitaDe = (a: any, uid: string) => !!a && !!uid && (a.createdByUid === uid || a.assignedTo === uid);

// ── Cita ↔ registro de origen (v2) ──────────────────────────────────────────
// Toda cita NUEVA generada desde un registro guarda su id real y su sección.
// Referidos: el registro real es el documento del anfitrión + el índice del referido.
// Las citas viejas sin sourceRecordId NO se reescriben: siguen su vínculo visual por nombre.
export function trazaRegistro(reg: { section?: string; _tipo?: string; recId?: string; id?: any; refIdx?: number; _refDe?: any; _refIdx?: number } | null) {
  if (!reg) return {};
  const section = reg.section || reg._tipo;
  if (!section) return {};
  if (section === "referidos") {
    const anf = reg.recId ?? reg._refDe ?? String(reg.id || "").split("::")[0];
    const idx = reg.refIdx ?? reg._refIdx ?? Number(String(reg.id || "").split("::")[1]);
    if (!anf) return {};
    return { sourceRecordId: String(anf), sourceSection: "referidos", ...(Number.isFinite(idx) ? { sourceRefIndex: idx } : {}) };
  }
  const id = reg.recId ?? reg.id;
  return id == null || id === "" ? {} : { sourceRecordId: String(id), sourceSection: section };
}
