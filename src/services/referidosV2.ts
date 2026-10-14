// ═══ REFERIDOS v2 — identidad permanente y obsequio (lógica pura, solo ACCESS_V2) ═══
//
// IDENTIDAD
//  • Cada referido individual recibe `refId` (permanente, aleatorio) la primera vez que su anfitrión
//    se escribe en v2. Eliminar o reordenar referidos ya no cambia la identidad de los demás.
//  • Citas, ventas y registros de Distribución creados desde un referido guardan `sourceRefId`
//    además de `sourceRefIndex` (que se conserva por compatibilidad y para firestore.rules).
//  • Resolver un vínculo: con `sourceRefId` → solo ese referido (si se eliminó, NO se cae a la
//    posición). Sin `sourceRefId` (citas antiguas) → la posición, pero solo si el teléfono o el nombre
//    de la cita coinciden con el referido que hoy ocupa esa posición. Nunca se reasigna por suposición.
//  • No hay migración: los datos antiguos se completan solo cuando ese anfitrión vuelve a escribirse.
//
// OBSEQUIO (regla actual, sin cambios: 4 citas coordinadas o 1 venta de sus referidos)
//  • Se cuenta por REFERIDO (cada uno suma una vez): cita = cita vinculada no cancelada (citas antiguas
//    cuya posición ya no coincide: solo si su teléfono identifica a un único referido) (o, si no
//    tiene citas vinculadas, el estado "Cita agendada" de siempre); venta = venta registrada en el
//    referido o en una cita/servicio vinculado no cancelado.
//  • El aviso sale una sola vez por anfitrión (marca `_obsequioAvisado`, la misma del flujo legacy).
//    Nunca se marca el regalo como entregado.
import { asList } from "./assignments";
import { genId } from "../utils/ids";
import { esStaffShared } from "../data/schema";

const vacio = (v: any) => v === undefined || v === null || String(v).trim() === "";
const digitos10 = (t: any) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length > 10 ? d.slice(-10) : d; };
const normNombre = (n: any) => String(n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const telefonosDe = (r: any) => [r?.telefono, r?.telefonoMovil, r?.telefonoCasa, r?.telefonoTrabajo, r?.tel].map(digitos10).filter((d) => d.length >= 7);

// ── Identidad ────────────────────────────────────────────────────────────────
export const nuevoRefId = () => `rf_${genId()}`;

// Da refId a los referidos que no lo tienen. Conserva la forma (lista o mapa legacy) y todo lo demás.
// Devuelve el MISMO objeto si no hay nada que completar.
export function asegurarRefIds(anf: any, gen: () => string = nuevoRefId) {
  const refs = anf?.referidos;
  if (!refs || typeof refs !== "object") return anf;
  let cambio = false;
  const fijar = (r: any) => { if (!r || typeof r !== "object" || !vacio(r.refId)) return r; cambio = true; return { ...r, refId: gen() }; };
  const out = Array.isArray(refs) ? refs.map(fijar) : Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, fijar(r)]));
  return cambio ? { ...anf, referidos: out } : anf;
}

// Un formulario abierto ANTES de que el anfitrión recibiera sus refId (p. ej. otra persona agendó una
// cita mientras tanto) guarda referidos sin refId. Para no romper esos vínculos, cada referido sin refId
// hereda el refId del referido guardado que es claramente la misma persona (mismo teléfono, o mismo
// nombre si no hay teléfono que comparar) y que no quedó ya en uso. Si no hay coincidencia clara → nuevo.
const mismaPersona = (a: any, b: any) => {
  const ta = telefonosDe(a), tb = telefonosDe(b);
  if (ta.length && tb.length) return ta.some((t) => tb.includes(t));
  const na = normNombre(a?.nombre), nb = normNombre(b?.nombre);
  return !!na && na === nb;
};
export function heredarRefIds(guardado: any, anf: any) {
  const refs = anf?.referidos;
  if (!guardado || !refs || typeof refs !== "object") return anf;
  const previos = asList(guardado.referidos).filter((r: any) => r && !vacio(r.refId));
  if (!previos.length) return anf;
  const usados = new Set(asList(refs).filter((r: any) => r && !vacio(r.refId)).map((r: any) => String(r.refId)));
  let cambio = false;
  const heredar = (r: any) => {
    if (!r || typeof r !== "object" || !vacio(r.refId)) return r;
    const p = previos.find((x: any) => !usados.has(String(x.refId)) && mismaPersona(r, x));
    if (!p) return r;
    usados.add(String(p.refId)); cambio = true;
    return { ...r, refId: String(p.refId) };
  };
  const out = Array.isArray(refs) ? refs.map(heredar) : Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, heredar(r)]));
  return cambio ? { ...anf, referidos: out } : anf;
}

// ¿La cita/registro antiguo (solo con posición) corresponde a este referido? Se compara lo que se
// pueda comparar: teléfono o nombre iguales → sí; alguno comparable y distinto → no; nada que
// comparar → se conserva el vínculo histórico tal cual (no se adivina otro).
export function coincideConReferido(src: any, ref: any): boolean {
  const t = digitos10(src?.telefono), ts = telefonosDe(ref);
  const tel = t.length >= 7 && ts.length ? ts.includes(t) : null;
  const n1 = normNombre(src?.nombre), n2 = normNombre(ref?.nombre);
  const nom = n1 && n2 ? n1 === n2 : null;
  if (tel === true || nom === true) return true;
  if (tel === false || nom === false) return false;
  return true;
}

// Ubica el referido al que apunta una cita / venta / registro trazado. null = sin vínculo seguro.
// opts.porTelefono (solo LECTURA, p. ej. el progreso del obsequio): si la posición de una cita antigua ya
// no corresponde, se reconoce únicamente cuando su teléfono identifica a UN solo referido del anfitrión.
// Nunca se usa para escribir ni se guarda en la cita.
export function resolverReferido(anf: any, src: any, opts: { verificar?: boolean; porTelefono?: boolean } = {}): { idx: number; ref: any; via: "refId" | "indice" | "telefono" } | null {
  const refs = asList(anf?.referidos);
  if (!vacio(src?.sourceRefId)) {
    const idx = refs.findIndex((r: any) => r && String(r.refId ?? "") === String(src.sourceRefId));
    return idx >= 0 ? { idx, ref: refs[idx], via: "refId" } : null;      // eliminado: nunca se cae a la posición
  }
  if (vacio(src?.sourceRefIndex)) return null;
  const idx = Number(src.sourceRefIndex);
  const porIndice = Number.isInteger(idx) && idx >= 0 && !!refs[idx] && (opts.verificar === false || coincideConReferido(src, refs[idx]));
  if (porIndice) return { idx, ref: refs[idx], via: "indice" };
  if (!opts.porTelefono) return null;
  const t = digitos10(src?.telefono);
  if (t.length < 7) return null;
  const hits = refs.map((r: any, i: number) => (r && telefonosDe(r).includes(t) ? i : -1)).filter((i: number) => i >= 0);
  return hits.length === 1 ? { idx: hits[0], ref: refs[hits[0]], via: "telefono" } : null;
}

// Posición ACTUAL de un referido identificado por refId (si lo tiene); si no, la posición dada.
// Para escribir sobre el referido correcto aunque la lista haya cambiado desde que se pintó.
export function indiceActual(refs: any[], refId: any, idx: number): number {
  if (!vacio(refId)) { const i = asList(refs).findIndex((r: any) => r && String(r.refId ?? "") === String(refId)); return i; }
  return idx;
}
// Aplica fn al referido (por refId si lo tiene; si no, por posición). Conserva lista/mapa.
export function actualizarReferido(anf: any, refId: any, idx: number, fn: (r: any) => any) {
  const refs = anf?.referidos;
  if (Array.isArray(refs)) {
    const i = indiceActual(refs, refId, idx);
    return i < 0 || !refs[i] ? anf : { ...anf, referidos: refs.map((r: any, j: number) => (j === i ? fn(r) : r)) };
  }
  const claves = Object.keys(refs || {});
  const i = indiceActual(Object.values(refs || {}), refId, idx);
  const k = claves[i];
  return k === undefined ? anf : { ...anf, referidos: { ...refs, [k]: fn(refs[k]) } };
}

// Dos orígenes trazados apuntan al mismo referido. Con refId en ambos manda el refId; si no,
// la posición (comportamiento anterior, para datos antiguos).
export function mismaReferenciaReferido(a: any, b: any): boolean {
  if (!vacio(a?.sourceRefId) && !vacio(b?.sourceRefId)) return String(a.sourceRefId) === String(b.sourceRefId);
  return String(a?.sourceRefIndex ?? "") === String(b?.sourceRefIndex ?? "");
}

// ── Sellado central (se aplica en cada cambio de estado v2) ──────────────────
// • Anfitriones que se escriben en este cambio → sus referidos reciben refId si no lo tienen
//   (heredado del guardado si es claramente la misma persona; si no, uno nuevo).
// • Citas y registros de Distribución NUEVOS que apuntan a un referido solo por posición → reciben
//   sourceRefId del referido que ocupa esa posición AHORA (se acaban de crear desde ese estado).
// • Citas existentes NO se tocan (storeCore además fija su origen en cada edición).
const nuevosSinRefId = (lista: any, prevLista: any) => {
  const antes = new Set(asList(prevLista).filter(Boolean).map((x: any) => String(x.id)));
  return asList(lista).filter((x: any) => x && !antes.has(String(x.id)) && x.sourceSection === "referidos"
    && !vacio(x.sourceRecordId) && !vacio(x.sourceRefIndex) && vacio(x.sourceRefId));
};
export function sellarReferidos(prev: any, next: any, gen: () => string = nuevoRefId) {
  if (!next || next === prev) return next;
  const cRefs = prev?.referidos !== next?.referidos, cAppts = prev?.appts !== next?.appts, cDist = prev?.distribucion !== next?.distribucion;
  if (!cRefs && !cAppts && !cDist) return next;
  const tocados = new Set<string>();
  const antes = new Map(asList(prev?.referidos).filter(Boolean).map((a: any) => [String(a.id), a]));
  if (cRefs) asList(next?.referidos).forEach((a: any) => { if (a && antes.get(String(a.id)) !== a) tocados.add(String(a.id)); });
  const pAppts = cAppts ? nuevosSinRefId(next.appts, prev?.appts) : [];
  const pDist = cDist ? nuevosSinRefId(next.distribucion, prev?.distribucion) : [];
  [...pAppts, ...pDist].forEach((x: any) => tocados.add(String(x.sourceRecordId)));
  if (!tocados.size) return next;
  let cambioRefs = false;
  const refsOut = asList(next?.referidos).map((a: any) => {
    if (!a || !tocados.has(String(a.id))) return a;
    const b = asegurarRefIds(heredarRefIds(antes.get(String(a.id)), a), gen); if (b !== a) cambioRefs = true; return b;
  });
  const porId = new Map(refsOut.filter(Boolean).map((a: any) => [String(a.id), a]));
  const sellar = (x: any) => {
    const r = asList(porId.get(String(x.sourceRecordId))?.referidos)[Number(x.sourceRefIndex)];
    return r && !vacio(r.refId) ? { ...x, sourceRefId: String(r.refId) } : x;
  };
  const pA = new Set(pAppts), pD = new Set(pDist);
  const out: any = { ...next };
  if (cambioRefs) out.referidos = refsOut;
  if (pA.size) out.appts = asList(next.appts).map((a: any) => (pA.has(a) ? sellar(a) : a));
  if (pD.size) out.distribucion = asList(next.distribucion).map((d: any) => (pD.has(d) ? sellar(d) : d));
  return cambioRefs || pA.size || pD.size ? out : next;
}

// ── Obsequio del programa de referidos ───────────────────────────────────────
export const REGLA_OBSEQUIO = { citas: 4, ventas: 1 };   // regla vigente (no cambia)
const VENTA_EN_CITA = ["demo_venta", "venta", "venta_servicio"];
const tipoDe = (a: any) => a?.tipo || a?._type || "";
const cancelada = (a: any) => a?.status === "cancelada";

export function progresoObsequio(anf: any, appts: any[]) {
  const refs = asList(anf?.referidos);
  const vinculadas: Record<number, any[]> = {};
  asList(appts).forEach((a: any) => {
    if (!a || a.sourceSection !== "referidos" || String(a.sourceRecordId) !== String(anf?.id)) return;
    const r = resolverReferido(anf, a, { porTelefono: true });
    if (r) (vinculadas[r.idx] ||= []).push(a);
  });
  let citas = 0, ventas = 0;
  refs.forEach((r: any, i: number) => {
    if (!r) return;
    const v = vinculadas[i] || [];
    const citasV = v.filter((a) => tipoDe(a) === "cita");
    const tieneCita = citasV.some((a) => !cancelada(a)) || (citasV.length === 0 && r.estado === "verde");
    const tieneVenta = r.venta === true || ["demo_venta", "venta"].includes(r.resultado)
      || v.some((a) => !cancelada(a) && VENTA_EN_CITA.includes(a.resultado));
    if (tieneCita) citas++;
    if (tieneVenta) ventas++;
  });
  const logrado = citas >= REGLA_OBSEQUIO.citas || ventas >= REGLA_OBSEQUIO.ventas;
  const motivo = ventas >= 1 ? (ventas === 1 ? "1 venta de sus referidos" : `${ventas} ventas de sus referidos`) : `${citas} citas coordinadas`;
  return { referidos: refs.filter(Boolean).length, citas, ventas, logrado, motivo };
}

export const idNotificacionObsequio = (anfId: any) => `obsequio_${anfId}`;
export function notificacionObsequio(anf: any, motivo: string, agente: string, leidoPor: string[], now: Date, logradoPor = "") {
  return {
    id: idNotificacionObsequio(anf?.id), tipo: "obsequio",
    titulo: `🎁 ¡Obsequio para ${anf?.anfitrion || "anfitrión"}!`,
    detalle: `${anf?.anfitrion || "Un anfitrión"} logró ${motivo}. Hay que pedir su regalo${anf?.regalo ? `: ${anf.regalo}` : ""}.${logradoPor ? ` Lo registró ${logradoPor}.` : ""}`,
    seccion: "🎁 Referidos", agente, fecha: now.toISOString(), leidoPor,
    ...(logradoPor ? { logradoPor } : {}),
  };
}
// Aviso PERSONAL de un telemarketing: es del sistema (no "suyo") y nace sin leer. useNotificaciones
// cuenta como no leída la que tiene agente ≠ agenteActivo y no lo incluye en leidoPor; con su propio
// nombre en ambos nacería ya leída. Quién lo logró queda en el detalle y en logradoPor.
export const AGENTE_SISTEMA = "Sistema";
const conNotificacion = (lista: any, n: any) => [n, ...asList(lista).filter((x: any) => x && x.id !== n.id)].slice(0, 100);

// Cambio de estado v2: si un anfitrión que se acaba de tocar (o cuyas citas cambiaron) alcanza la
// regla y todavía no fue avisado → lo marca y deja UNA notificación (id fijo por anfitrión).
// Staff: la notificación va a las compartidas (la ve el resto del equipo). Telemarketing: a sus
// notificaciones personales, y el staff la recibe por relevoObsequioStaff.
export function transicionObsequio(prev: any, next: any, autor: { uid?: string; nombre?: string } | null, rol: string, now: Date = new Date()) {
  if (!next || next === prev) return next;
  const cRefs = prev?.referidos !== next?.referidos, cAppts = prev?.appts !== next?.appts;
  if (!cRefs && !cAppts) return next;
  const tocados = new Set<string>();
  if (cRefs) {
    const antes = new Map(asList(prev?.referidos).filter(Boolean).map((a: any) => [String(a.id), a]));
    asList(next?.referidos).forEach((a: any) => { if (a && antes.get(String(a.id)) !== a) tocados.add(String(a.id)); });
  }
  if (cAppts) {
    const antes = new Map(asList(prev?.appts).filter(Boolean).map((a: any) => [String(a.id), a]));
    asList(next?.appts).forEach((a: any) => { if (a && a.sourceSection === "referidos" && antes.get(String(a.id)) !== a) tocados.add(String(a.sourceRecordId)); });
  }
  if (!tocados.size) return next;
  const staff = esStaffShared(rol), nombre = autor?.nombre || "";
  const notifs: any[] = [];
  const refsOut = asList(next?.referidos).map((anf: any) => {
    if (!anf || !tocados.has(String(anf.id)) || anf._obsequioAvisado || anf.eliminado) return anf;
    const p = progresoObsequio(anf, next.appts);
    if (!p.logrado) return anf;
    notifs.push(staff
      ? notificacionObsequio(anf, p.motivo, nombre, nombre ? [nombre] : [], now)      // staff: quien lo registró ya lo conoce (igual que antes)
      : notificacionObsequio(anf, p.motivo, AGENTE_SISTEMA, [], now, nombre));         // telemarketing: aviso personal pendiente
    return { ...anf, _obsequioAvisado: true, obsequioLogrado: {
      at: now.toISOString(), motivo: p.motivo, citas: p.citas, ventas: p.ventas,
      porUid: autor?.uid || "", porNombre: nombre, avisoStaff: staff, ...(staff ? { avisoStaffAt: now.toISOString() } : {}) } };
  });
  if (!notifs.length) return next;
  let lista = next.notificaciones;
  notifs.forEach((n) => { lista = conNotificacion(lista, n); });
  return { ...next, referidos: refsOut, notificaciones: lista };
}

// Solo staff (sus notificaciones son las compartidas): anfitriones que cumplió un telemarketing →
// una notificación para el equipo (sin leer para todos) y se marca, para no repetirla.
export function relevoObsequioStaff(state: any, now: Date = new Date()) {
  const pend = asList(state?.referidos).filter((a: any) => a && !a.eliminado && a.obsequioLogrado && a.obsequioLogrado.avisoStaff !== true);
  if (!pend.length) return state;
  let lista = state.notificaciones;
  const ids = new Set(asList(lista).filter(Boolean).map((n: any) => n.id));
  const marcar = new Set(pend.map((a: any) => String(a.id)));
  pend.forEach((a: any) => {
    if (!ids.has(idNotificacionObsequio(a.id))) lista = conNotificacion(lista, notificacionObsequio(a, a.obsequioLogrado.motivo || "el requisito", a.obsequioLogrado.porNombre || "Telemarketing", [], now));
  });
  const referidos = asList(state.referidos).map((a: any) => (a && marcar.has(String(a.id)) ? { ...a, obsequioLogrado: { ...a.obsequioLogrado, avisoStaff: true, avisoStaffAt: now.toISOString() } } : a));
  return { ...state, referidos, notificaciones: lista };
}
