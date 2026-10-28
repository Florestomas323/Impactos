// ═══ VENTA DESDE AGENDA: corrección y restauración (v2) ══════════════════════
// Bug corregido: una cita ya sincronizada (_sincronizado) que pasaba de Demo / venta a otro
// resultado seguía contando como venta, porque la venta vive en el HISTORIAL del registro de
// origen (contarVentasDemos salta las citas sincronizadas) y nada la reconciliaba.
//
// Regla: la venta de UNA cita vive en UNA entrada de historial ligada por apptId.
//   venta → no venta : esa entrada pasa al resultado nuevo (monto 0) y guarda la venta en
//                      `ventaCorregida`; métricas: demo_no_venta = 1 demo, 0 ventas, $0.
//   no venta → venta : la MISMA entrada vuelve a demo_venta con el monto/producto de la cita.
//   Otras ventas del mismo cliente no se tocan; venta:false solo si no queda ninguna vigente.
// Distribución se reconcilia aparte con reconciliarDistribucionPorVenta (ventaDistribucionV2).
//
// Compatibilidad con ventas HISTÓRICAS (sin migración; self-heal al tocarlas):
//   Evidencia primaria: Distribución ya guardaba ventasOrigen[].apptId desde antes de este cambio.
//   Una cita con esa referencia YA produjo una venta, aunque le falte _sincronizado o su historial
//   no tenga apptId. Orden para encontrar la entrada de historial de ESA cita:
//     1) historial[].apptId === cita.id                                   (ruta moderna)
//     2) entradas sin apptId, tipo "cita", demo_venta/venta, comparadas con la referencia de
//        Distribución (monto/producto de la venta ORIGINAL; si no hay referencia única, con la
//        cita y exigiendo la nota "💰 Venta agendada en Agenda"). Si quedan varias, se prefieren
//        las que tienen esa nota.
//   Solo se usa si queda UNA candidata: se sella con apptId (y la cita con _sincronizado) y desde
//   ahí se comporta como venta moderna. 0 o más de 1 → "no_asociada": no se toca el historial
//   (no se borra una venta al azar); Distribución igual se reconcilia por la referencia exacta.
import { esVentaParaDistribucion } from "./ventaDistribucionV2";
import { esServicio } from "./serviceV2";
import { isCancelled, sourceRecordForAppt } from "./agendaV2";

const lst = (v: any): any[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const vacio = (v: any) => v === undefined || v === null || String(v).trim() === "";
const esVentaHist = (r: any) => r === "demo_venta" || r === "venta" || r === "venta_servicio";
export const MARCA_VENTA_AGENDA = "💰 Venta agendada en Agenda";
const ETIQUETA: Record<string, string> = {
  demo_no_venta: "Demo / no venta", no_recibio: "No recibió", no_visito: "No visitó",
  seguimiento: "Seguimiento", reprogramada_visita: "Reprogramada en visita", cancelada: "Cancelada", sin_resultado: "Sin resultado",
};
type Autor = { uid?: string; nombre?: string } | null | undefined;

// ── Qué hacer después de actualizar una cita en la Agenda ───────────────────
// Legacy (v2 = false) y servicios: exactamente la condición de siempre.
// v2 · citas: App decide con el estado completo (decidirVentaCitaV2), así una venta histórica
// sin _sincronizado también se reconoce. Sin evidencia de venta, App termina sin cambios.
export function accionTrasActualizarCita(u: any, v2: boolean): "sincronizar" | "reconciliar" | null {
  if (!u) return null;
  if (v2 && !esServicio(u)) return "reconciliar";
  if (u.resultado === "demo_venta" && !u._sincronizado) return "sincronizar";
  return null;
}

// Referencias de venta de ESTA cita en fichas ACTIVAS de Distribución (evidencia histórica).
export function refsVentaDeCita(distribucion: any, apptId: any) {
  const out: { ficha: any; ref: any }[] = [];
  lst(distribucion).forEach((f: any) => {
    if (!f || f.eliminado) return;
    lst(f.ventasOrigen).forEach((v: any) => { if (v && String(v.apptId) === String(apptId)) out.push({ ficha: f, ref: v }); });
  });
  return out;
}

// ── Venta inicial (la usa sincronizarVentaAgenda en v2) ──────────────────────
// Mismos campos que el código de siempre. `historialSoloArreglo`: rama de Referidos, que
// históricamente solo continúa historiales con forma de arreglo.
export function registroConVentaDeCita(r: any, appt: any, entrada: any, opts: { cartucho?: boolean; historialSoloArreglo?: boolean } = {}) {
  const monto = Number(appt?.monto) || 0;
  const previo = opts.historialSoloArreglo ? (Array.isArray(r?.historial) ? r.historial : []) : lst(r?.historial);
  return {
    ...r, venta: true, resultado: "demo_venta",
    ultimo_monto_venta: monto || r?.ultimo_monto_venta, ultimo_producto: appt?.producto || r?.ultimo_producto,
    ...(opts.cartucho ? { ultimo_cartucho_meses: appt?.cartucho_meses || r?.ultimo_cartucho_meses } : {}),
    historial: [...previo, entrada],
  };
}

// ── Entrada de historial de ESA cita ─────────────────────────────────────────
// `ref`: la referencia ÚNICA de Distribución para esta cita (ventasOrigen[].apptId === cita.id), si existe.
export function entradaDeCita(historial: any, appt: any, ref: any = null): { idx: number; via: "apptId" | "historica_distribucion" | "legacy_unico" } | null {
  const hist = lst(historial);
  const porId = hist.findIndex((h: any) => h && !vacio(h.apptId) && String(h.apptId) === String(appt?.id));
  if (porId >= 0) return { idx: porId, via: "apptId" };
  const marca = (h: any) => String(h.notas || "").startsWith(MARCA_VENTA_AGENDA);
  // Valores de la venta ORIGINAL: la referencia manda (se guardó al vender; monto/producto solo si existían).
  // Sin referencia: los de la cita, y solo los que la cita tenga.
  const montoEsp = ref ? Number(ref.monto) || 0 : vacio(appt?.monto) ? null : Number(appt.monto) || 0;
  const prodEsp = ref ? String(ref.producto || "") : vacio(appt?.producto) ? null : String(appt.producto);
  let candidatas = hist
    .map((h: any, i: number) => ({ h, i }))
    .filter(({ h }) => h && vacio(h.apptId) && h.tipo === "cita" && (h.cita_resultado === "demo_venta" || h.cita_resultado === "venta")
      && (montoEsp === null || (Number(h.monto) || 0) === montoEsp)
      && (prodEsp === null || String(h.producto || "") === prodEsp)
      && (ref ? true : marca(h)));                              // sin evidencia de Distribución: exige la nota de Agenda
  if (candidatas.length > 1) candidatas = candidatas.filter(({ h }) => marca(h));
  return candidatas.length === 1 ? { idx: candidatas[0].i, via: ref ? "historica_distribucion" : "legacy_unico" } : null;
}

// ── Reconcilia el registro de origen con el resultado ACTUAL de la cita ─────
export type CambioRegistro = "corregida" | "restaurada" | "actualizada" | "sin_cambios" | "no_asociada";
export function reconciliarRegistroPorCita(r: any, appt: any, now: Date = new Date(), autor: Autor = null, opts: { cartucho?: boolean; ref?: any } = {}) {
  const hist = lst(r?.historial);
  const hit = entradaDeCita(hist, appt, opts.ref || null);
  if (!r || !hit) return { registro: r, cambio: "no_asociada" as CambioRegistro, via: null };
  const h = hist[hit.idx];
  const eraVenta = esVentaHist(h.cita_resultado);
  const ventaAhora = esVentaParaDistribucion(appt);
  const at = now.toISOString();
  const correccion = (de: any, a: any) => ({ de, a, at, ...(autor?.uid ? { porUid: autor.uid } : {}), ...(autor?.nombre ? { porNombre: autor.nombre } : {}) });
  let nueva: any;
  let cambio: CambioRegistro;

  if (ventaAhora) {
    const monto = Number(appt.monto) || 0, producto = appt.producto || "", meses = Number(appt.cartucho_meses) || 0;
    if (eraVenta && String(h.apptId ?? "") === String(appt.id) && (Number(h.monto) || 0) === monto
      && String(h.producto || "") === String(producto) && (Number(h.cartucho_meses) || 0) === meses) {
      return { registro: r, cambio: "sin_cambios" as CambioRegistro, via: hit.via };
    }
    nueva = { ...h, apptId: appt.id, cita_resultado: "demo_venta", monto, producto, cartucho_meses: meses };
    if (!eraVenta) {
      nueva.notas = h.notasAntesCorreccion ?? h.notas;
      delete nueva.notasAntesCorreccion; delete nueva.ventaCorregida;
      nueva.correcciones = [...lst(h.correcciones), correccion(h.cita_resultado, "demo_venta")];
    }
    cambio = eraVenta ? "actualizada" : "restaurada";
  } else {
    const resultado = isCancelled(appt) ? "cancelada" : (appt?.resultado || "sin_resultado");
    if (!eraVenta && h.cita_resultado === resultado && String(h.apptId ?? "") === String(appt.id)) {
      return { registro: r, cambio: "sin_cambios" as CambioRegistro, via: hit.via };
    }
    const base = eraVenta ? h.notas : (h.notasAntesCorreccion ?? h.notas);
    nueva = {
      ...h, apptId: appt.id, cita_resultado: resultado, monto: 0, cartucho_meses: 0,
      notasAntesCorreccion: base, notas: `${base || ""} · Corregida: ${ETIQUETA[resultado] || resultado}`,
      ...(eraVenta ? { ventaCorregida: { monto: Number(h.monto) || 0, producto: h.producto || "", cartucho_meses: Number(h.cartucho_meses) || 0 } } : {}),
      correcciones: [...lst(h.correcciones), correccion(h.cita_resultado, resultado)],
    };
    cambio = "corregida";
  }

  const historial = hist.map((x: any, i: number) => (i === hit.idx ? nueva : x));
  let registro: any = { ...r, historial };
  if (ventaAhora) {
    registro = { ...registro, venta: true, resultado: "demo_venta",
      ultimo_monto_venta: (Number(appt.monto) || 0) || r.ultimo_monto_venta, ultimo_producto: appt.producto || r.ultimo_producto,
      ...(opts.cartucho ? { ultimo_cartucho_meses: appt.cartucho_meses || r.ultimo_cartucho_meses } : {}) };
  } else {
    // Otra venta vigente del mismo cliente (otra cita, servicio o venta desde la tarjeta) → el cliente sigue con venta.
    const otraVenta = historial.some((x: any, i: number) => i !== hit.idx && x && esVentaHist(x.cita_resultado)) || !vacio(r.ventaRegistroId);
    if (!otraVenta) {
      registro.venta = false;
      if (r.resultado === "demo_venta" || r.resultado === "venta") registro.resultado = nueva.cita_resultado;
    }
  }
  return { registro, cambio, via: hit.via };
}

// ── Dónde está el registro de origen de una cita sincronizada ───────────────
// El mismo que usó la sincronización: _clienteGrupo/_clienteId (teléfono o prospecto creado por
// la Agenda); en Referidos, el referido por su identidad (src de sourceRecordForAppt, que resuelve
// sourceRefId aunque haya cambiado de posición).
export function ubicarRegistroDeCita(appt: any, src: { section: string; id: string; refIdx?: number } | null) {
  const grupo = appt?._clienteGrupo;
  if (grupo === "referidos" || (!grupo && src?.section === "referidos")) {
    return src && src.section === "referidos" && src.refIdx != null ? { section: "referidos", id: String(src.id), refIdx: src.refIdx } : null;
  }
  if (grupo && !vacio(appt?._clienteId)) return { section: String(grupo), id: String(appt._clienteId) };
  return src ? { section: src.section, id: String(src.id) } : null;
}

// Aplica fn al registro (o al referido dentro de su anfitrión: arreglo o mapa, como la sincronización).
export function mapearRegistro(state: any, loc: { section: string; id: string; refIdx?: number } | null, fn: (r: any) => any) {
  if (!loc) return state;
  const lista = lst(state?.[loc.section]);
  if (loc.section === "referidos" && loc.refIdx != null) {
    return { ...state, referidos: lista.map((anf: any) => {
      if (!anf || String(anf.id) !== loc.id) return anf;
      if (Array.isArray(anf.referidos)) return { ...anf, referidos: anf.referidos.map((x: any, i: number) => (i === loc.refIdx ? fn(x) : x)) };
      const k = Object.keys(anf.referidos || {})[loc.refIdx!];
      return k === undefined ? anf : { ...anf, referidos: { ...anf.referidos, [k]: fn(anf.referidos[k]) } };
    }) };
  }
  return { ...state, [loc.section]: lista.map((x: any) => (x && String(x.id) === loc.id ? fn(x) : x)) };
}

// Paso completo sobre el estado (sin Distribución): registro de origen de ESA cita.
// Si la entrada se asocia y la cita no estaba sincronizada (venta histórica), la cita queda sellada
// (_sincronizado + _cliente*) igual que una venta moderna: su venta vive en el historial, no se cuenta doble.
export function reconciliarVentaAgendaEnEstado(state: any, appt: any, src: any = undefined, now: Date = new Date(), autor: Autor = null) {
  const refs = refsVentaDeCita(state?.distribucion, appt?.id);
  const ref = refs.length === 1 ? refs[0].ref : null;
  const fuente = src !== undefined ? src : sourceRecordForAppt(state, appt);
  // Sin origen resoluble desde la cita: el de la ficha de Distribución (guarda sourceSection/Id/RefId de la venta).
  const srcFinal = fuente || (refs.length === 1 && !vacio(refs[0].ficha.sourceRecordId) ? sourceRecordForAppt(state, refs[0].ficha) : null);
  const loc = ubicarRegistroDeCita(appt, srcFinal);
  let info: { cambio: CambioRegistro; via: any } = { cambio: "no_asociada", via: null };
  const out = mapearRegistro(state, loc, (r) => {
    const x = reconciliarRegistroPorCita(r, appt, now, autor, { cartucho: loc?.section !== "referidos", ref });
    info = { cambio: x.cambio, via: x.via };
    return x.cambio === "sin_cambios" || x.cambio === "no_asociada" ? r : x.registro;
  });
  if (info.cambio === "sin_cambios" || info.cambio === "no_asociada") return { state, info, loc };
  const sellar = !appt._sincronizado && loc;
  const appts = sellar ? lst(out.appts).map((a: any) => (a && String(a.id) === String(appt.id) ? { ...a, _sincronizado: true, _clienteId: loc!.id, _clienteGrupo: loc!.section } : a)) : out.appts;
  return { state: sellar ? { ...out, appts } : out, info, loc };
}

// ── v2: ¿qué hacer con ESTA cita después de actualizarla? (App, dentro de setState) ──
//   "reconciliar"   → tiene evidencia de venta: _sincronizado, o una referencia exacta en
//                     Distribución (ventasOrigen[].apptId), o una entrada de historial con su apptId.
//   "venta_inicial" → sin evidencia y ahora es venta: la sincronización de siempre.
//   "nada"          → sin evidencia y sin venta: nada que reconciliar.
export function decidirVentaCitaV2(state: any, appt: any): "reconciliar" | "venta_inicial" | "nada" {
  if (!appt || esServicio(appt)) return "nada";
  if (appt._sincronizado || refsVentaDeCita(state?.distribucion, appt.id).length > 0) return "reconciliar";
  const loc = ubicarRegistroDeCita(appt, sourceRecordForAppt(state, appt));
  let sellada = false;
  mapearRegistro(state, loc, (r) => { sellada = lst(r?.historial).some((h: any) => h && String(h.apptId ?? "") === String(appt.id)); return r; });
  if (sellada) return "reconciliar";
  return appt.resultado === "demo_venta" ? "venta_inicial" : "nada";
}
