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
// Compatibilidad (sin migrar): las entradas creadas ANTES de este cambio no tienen apptId.
// Fallback estricto: solo se asocia una entrada sin apptId si es la ÚNICA del registro que
// cumple todo: tipo "cita", venta vigente, nota de Agenda ("💰 Venta agendada en Agenda"),
// mismo monto y mismo producto que la cita. Si hay 0 o más de 1 candidata, el historial NO se
// toca (cambio "no_asociada"): se prefiere no borrar una venta legítima. Al asociarla queda
// sellada con apptId, así las siguientes correcciones ya no dependen del fallback.
import { esVentaParaDistribucion } from "./ventaDistribucionV2";
import { esServicio } from "./serviceV2";
import { isCancelled } from "./agendaV2";

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
// Legacy (v2 = false): exactamente la condición de siempre.
export function accionTrasActualizarCita(u: any, v2: boolean): "sincronizar" | "reconciliar" | null {
  if (!u) return null;
  if (u.resultado === "demo_venta" && !u._sincronizado) return "sincronizar";
  if (v2 && u._sincronizado && !esServicio(u)) return "reconciliar";
  return null;
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
export function entradaDeCita(historial: any, appt: any): { idx: number; via: "apptId" | "legacy_unico" } | null {
  const hist = lst(historial);
  const porId = hist.findIndex((h: any) => h && !vacio(h.apptId) && String(h.apptId) === String(appt?.id));
  if (porId >= 0) return { idx: porId, via: "apptId" };
  const monto = Number(appt?.monto) || 0, producto = String(appt?.producto || "");
  const candidatas = hist
    .map((h: any, i: number) => ({ h, i }))
    .filter(({ h }) => h && vacio(h.apptId) && h.tipo === "cita" && esVentaHist(h.cita_resultado)
      && String(h.notas || "").startsWith(MARCA_VENTA_AGENDA)
      && (Number(h.monto) || 0) === monto && String(h.producto || "") === producto);
  return candidatas.length === 1 ? { idx: candidatas[0].i, via: "legacy_unico" } : null;
}

// ── Reconcilia el registro de origen con el resultado ACTUAL de la cita ─────
export type CambioRegistro = "corregida" | "restaurada" | "actualizada" | "sin_cambios" | "no_asociada";
export function reconciliarRegistroPorCita(r: any, appt: any, now: Date = new Date(), autor: Autor = null, opts: { cartucho?: boolean } = {}) {
  const hist = lst(r?.historial);
  const hit = entradaDeCita(hist, appt);
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
export function reconciliarVentaAgendaEnEstado(state: any, appt: any, src: any, now: Date = new Date(), autor: Autor = null) {
  const loc = ubicarRegistroDeCita(appt, src);
  let info: { cambio: CambioRegistro; via: any } = { cambio: "no_asociada", via: null };
  const out = mapearRegistro(state, loc, (r) => {
    const x = reconciliarRegistroPorCita(r, appt, now, autor, { cartucho: loc?.section !== "referidos" });
    info = { cambio: x.cambio, via: x.via };
    return x.cambio === "sin_cambios" || x.cambio === "no_asociada" ? r : x.registro;
  });
  return { state: info.cambio === "sin_cambios" || info.cambio === "no_asociada" ? state : out, info, loc };
}
