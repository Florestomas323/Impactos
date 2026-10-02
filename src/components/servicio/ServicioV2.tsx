// ═══ SERVICIO v2 — interfaz (la lógica vive en services/serviceV2.ts) ═══════
// UNA sola tarjeta de acciones de servicio para la pestaña Servicio y para la
// Agenda (tipo servicio): mismo modelo de resultados, reprogramar y cancelar.
import { useState } from "react";
import { mapsLink, fechaLocal, localDateTimeValue, PALETA_TIPOS, COLOR_CANCELADA } from "../../services/agendaV2";
import {
  estadoServicio, ESTADO_SERVICIO, serviceReadOnly, registrarResultadoServicio, registrarVentaServicio,
  reprogramarServicio, cancelarServicio, notaServicio, mantenimientoDesdeServicio, duplicateServiceCandidate,
  enFiltroServicio, serviceCounters, esServicio, type FiltroServicio,
} from "../../services/serviceV2";

const btn = "text-xs font-bold py-2 px-3 rounded-lg";
const tel = (n: string) => "tel:" + String(n || "").replace(/\D/g, "").slice(-10);
const wa = (n: string) => { let d = String(n || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return "https://wa.me/" + d; };
const fmt = (f: any) => {
  const l = fechaLocal(f); if (!l) return { fecha: "Sin fecha", hora: "" };
  const d = new Date(l);
  return { fecha: d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }), hora: l.slice(11, 16) === "00:00" ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) };
};
const cuando = (iso: any) => { const l = fechaLocal(iso); return l ? new Date(l).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""; };

// ── Acciones de UN servicio ──────────────────────────────────────────────────
// productos: [{label, meses}] · appts: para revisar duplicados del mantenimiento.
export function ServicioAccionesV2({ s, autor, puedeGestionar, puedeBorrar, appts, productos = [], genId, onUpdate, onCrear, onBorrar }: any) {
  const [paso, setPaso] = useState("");            // "" | venta | reprogramar | cancelar | editar | corregir
  const [venta, setVenta] = useState({ prod: "", monto: "" });
  const [fecha, setFecha] = useState(fechaLocal(s.fecha) || localDateTimeValue(new Date()));
  const [motivo, setMotivo] = useState("");
  const [draft, setDraft] = useState<any>(null);
  const [nota, setNota] = useState("");
  const [mant, setMant] = useState<any>(null);     // {m, dup} mantenimiento con posible duplicado
  const [enviado, setEnviado] = useState(false);   // evita dobles toques en un resultado
  const est = estadoServicio(s), info = ESTADO_SERVICIO[est], cerrado = serviceReadOnly(s), cancelado = est === "cancelado";
  const maps = mapsLink(s);
  const resultado = (r: "realizado" | "no_recibio" | "no_visito") => { if (enviado) return; setEnviado(true); onUpdate(registrarResultadoServicio(s, r, autor)); setPaso(""); };
  const registrarVenta = () => {
    if (enviado || !venta.prod) return;
    setEnviado(true);
    const [label, ms] = venta.prod.split("|"); const meses = Number(ms) || 0;
    const u = registrarVentaServicio(s, { monto: venta.monto, producto: label }, autor);
    onUpdate(u); setPaso("");
    if (meses > 0 && onCrear) {
      const m = mantenimientoDesdeServicio(u, { producto: label, meses }, new Date(), genId());
      const dup = duplicateServiceCandidate(appts || [], m, 7);
      if (dup) setMant({ m, dup }); else onCrear(m);
    }
  };
  const mostrarResultados = puedeGestionar && !cancelado && (!cerrado || paso === "corregir");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className={`inline-flex items-center font-bold px-2.5 py-1 rounded-full ${info.badge}`}>{info.label}</span>
        {est === "venta" && s.monto ? <span className="font-bold text-emerald-700">${Number(s.monto).toLocaleString("en-US")}{s.producto ? ` · ${s.producto}` : ""}</span> : null}
        {s.resultByName && !cancelado && <span className="text-slate-500">Registrado por <b>{s.resultByName}</b>{s.resultAt ? ` · ${cuando(s.resultAt)}` : ""}</span>}
        {cancelado && <span className="text-slate-500">por <b>{s.cancelledByName || "—"}</b>{s.cancelReason ? ` · ${s.cancelReason}` : ""}</span>}
        {s.createdByName && <span className="text-slate-400">· Agendado por {s.createdByName}</span>}
      </div>
      {/* Operación: llamar, WhatsApp (sin envío automático), cómo llegar (dirección del servicio, no GPS) */}
      <div className="flex gap-1.5 flex-wrap">
        {s.telefono && <a href={tel(s.telefono)} className={`${btn} bg-[#eef4ff] text-[#1d4ed8]`}>Llamar</a>}
        {s.telefono && <a href={wa(s.telefono)} target="_blank" rel="noreferrer" className={`${btn} bg-[#e9f9ef] text-[#15803d]`}>WhatsApp</a>}
        {maps && <a href={maps} target="_blank" rel="noreferrer" className={`${btn} bg-[#f4f6f9] text-slate-700`}>Cómo llegar</a>}
      </div>
      {mostrarResultados && (
        <div className="grid grid-cols-2 gap-2">
          <button disabled={enviado} onClick={() => resultado("realizado")} className={`${btn} py-2.5 text-emerald-700 bg-emerald-50 disabled:opacity-40`}>Servicio realizado</button>
          <button disabled={enviado} onClick={() => setPaso(paso === "venta" ? "" : "venta")} className={`${btn} py-2.5 text-white disabled:opacity-40`} style={{ background: "#047857" }}>Venta durante servicio</button>
          <button disabled={enviado} onClick={() => resultado("no_recibio")} className={`${btn} py-2.5 text-white disabled:opacity-40`} style={{ background: "#DC2626" }}>No recibió</button>
          <button disabled={enviado} onClick={() => resultado("no_visito")} className={`${btn} py-2.5 text-white disabled:opacity-40`} style={{ background: "#7C3AED" }}>No se visitó</button>
        </div>
      )}
      {paso === "venta" && (
        <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 space-y-2">
          <select value={venta.prod} onChange={(e) => setVenta({ ...venta, prod: e.target.value })} className="w-full border border-emerald-300 rounded-lg px-2 py-2 text-sm bg-white font-bold text-slate-800">
            <option value="">Producto vendido…</option>
            {productos.map((o: any) => <option key={o.label} value={o.label + "|" + (o.meses || 0)}>{o.label}{o.meses ? ` (mant. ${o.meses}m)` : ""}</option>)}
          </select>
          <input type="number" inputMode="decimal" value={venta.monto} onChange={(e) => setVenta({ ...venta, monto: e.target.value })} placeholder="Monto de la venta" className="w-full border border-emerald-300 rounded-lg px-2 py-2 text-sm bg-white text-slate-800" />
          <div className="text-[11px] text-emerald-800">Cuenta como venta, volumen y servicio realizado (no como demostración).</div>
          <button disabled={!venta.prod || enviado} onClick={registrarVenta} className="w-full px-3 py-2 rounded-lg text-xs font-black text-white disabled:opacity-40" style={{ background: "#047857" }}>Registrar venta</button>
        </div>
      )}
      {mant && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-2">
          <div><b>Ya existe un servicio similar para este cliente cerca de esa fecha.</b> No se creó el mantenimiento automático ({fechaLocal(mant.m.fecha).slice(0, 10)}).</div>
          <div className="flex gap-2">
            <button onClick={() => setMant(null)} className="flex-1 font-bold py-2 rounded-lg bg-white text-slate-700">No crear</button>
            <button onClick={() => { onCrear(mant.m); setMant(null); }} className="flex-1 font-bold py-2 rounded-lg text-white" style={{ background: "#d97706" }}>Crear de todos modos</button>
          </div>
        </div>
      )}
      {puedeGestionar && (
        <div className="flex gap-1.5 flex-wrap">
          {!cerrado && <button onClick={() => setPaso(paso === "reprogramar" ? "" : "reprogramar")} className={`${btn} bg-[#fff7ed] text-[#c2410c]`}>Reprogramar</button>}
          {!cerrado && <button onClick={() => setPaso(paso === "cancelar" ? "" : "cancelar")} className={`${btn} bg-[#f4f6f9] text-slate-600`}>Cancelar servicio</button>}
          {!cancelado && <button onClick={() => { setDraft({ nombre: s.nombre || "", telefono: s.telefono || "", direccion: s.direccion || "", ciudad: s.ciudad || "", cp: s.cp || "", cuenta: s.cuenta || "", producto: s.producto || "" }); setPaso(paso === "editar" ? "" : "editar"); }} className={`${btn} bg-[#f4f6f9] text-slate-600`}>Editar datos</button>}
          {cerrado && !cancelado && <button onClick={() => { setEnviado(false); setPaso(paso === "corregir" ? "" : "corregir"); }} className={`${btn} bg-white border border-slate-200 text-slate-500`}>{paso === "corregir" ? "Cerrar corrección" : "Corregir resultado"}</button>}
          {puedeBorrar && onBorrar && <button onClick={() => { if (confirm("¿Borrar DEFINITIVAMENTE este servicio? Lo normal es cancelarlo.")) onBorrar(s.id); }} className={`${btn} bg-red-50 text-red-600`}>Administración: borrar definitivamente</button>}
        </div>
      )}
      {paso === "reprogramar" && (
        <div className="flex gap-2 items-center">
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="flex-1 border-2 border-[#e5def4] rounded-lg px-2 py-1.5 text-sm" />
          <button disabled={!fecha} onClick={() => { onUpdate(reprogramarServicio(s, fecha, autor)); setPaso(""); }} className={`${btn} text-white disabled:opacity-40`} style={{ background: "#c2410c" }}>Guardar</button>
        </div>
      )}
      {paso === "cancelar" && (
        <div className="space-y-2">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full border-2 border-[#e5def4] rounded-lg px-2 py-1.5 text-sm" />
          <button onClick={() => { onUpdate(cancelarServicio(s, autor, new Date(), motivo.trim())); setPaso(""); }} className={`${btn} w-full text-white`} style={{ background: "#64748b" }}>Cancelar servicio</button>
        </div>
      )}
      {paso === "editar" && draft && (
        <div className="grid grid-cols-2 gap-1.5">
          {[["nombre", "Nombre"], ["telefono", "Teléfono"], ["direccion", "Dirección"], ["ciudad", "Ciudad"], ["cp", "CP"], ["cuenta", "Cuenta"], ["producto", "Producto / servicio"]].map(([k, l]) => (
            <input key={k} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} placeholder={l} className={`border border-slate-200 rounded-lg px-2 py-1.5 text-sm ${k === "direccion" || k === "producto" ? "col-span-2" : ""}`} />
          ))}
          <button onClick={() => { onUpdate({ ...s, ...draft, actualizado: new Date().toISOString() }); setPaso(""); }} className={`${btn} col-span-2 text-white`} style={{ background: "#1d4ed8" }}>Guardar datos</button>
        </div>
      )}
      {/* Notas: se acumulan con autor real */}
      {puedeGestionar && !cancelado && (
        <div className="flex gap-1.5">
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota del servicio…" className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 text-sm" />
          <button disabled={!nota.trim()} onClick={() => { onUpdate(notaServicio(s, nota, autor)); setNota(""); }} className={`${btn} text-white disabled:opacity-40`} style={{ background: "#16A34A" }}>Guardar</button>
        </div>
      )}
      {(s.servicioNotas || []).length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {[...(s.servicioNotas || [])].reverse().map((n: any, i: number) => (
            <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 text-[11px]">
              <div className="text-slate-700">{n.texto}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">{cuando(n.fecha)}{n.nombre || n.agente ? ` · ${n.nombre || n.agente}` : ""}</div>
            </div>
          ))}
        </div>
      )}
      {(s.servicioHistorial || []).length > 0 && (
        <div className="text-[10px] text-slate-400">
          Historial: {(s.servicioHistorial || []).slice(-3).map((h: any) => `${ESTADO_SERVICIO[h.resultado as keyof typeof ESTADO_SERVICIO]?.label || h.resultado} (${cuando(h.fecha)}${h.nombre || h.agente ? ` · ${h.nombre || h.agente}` : ""})`).join(" → ")}
        </div>
      )}
    </div>
  );
}

// ── Pestaña Servicio (v2) ────────────────────────────────────────────────────
const FILTROS: Array<[FiltroServicio, string]> = [["hoy", "Hoy"], ["todos", "Todos"], ["pendiente", "Pend."], ["hechos", "Hechos"], ["no_realizados", "No"], ["cancelados", "Cancel."]];
const FILTRO_INIT: Record<string, FiltroServicio> = { hoy: "hoy", todos: "todos", pendiente: "pendiente", realizado: "hechos", no_realizado: "no_realizados" };
export function ServiciosV2({ appts, setAppts, autor, puedeGestionar, puedeBorrar, productos, genId, renderCartuchos, init }: any) {
  const [vista, setVista] = useState("servicios");
  const [filtro, setFiltro] = useState<FiltroServicio>(FILTRO_INIT[init?.filtro] || "todos");
  const [abierto, setAbierto] = useState<any>(null);
  const servicios = (appts || []).filter(esServicio);
  const c = serviceCounters(servicios);
  const n: Record<FiltroServicio, number> = { hoy: c.hoy, todos: c.todos, pendiente: c.pendiente, hechos: c.hechos, no_realizados: c.no_realizados, cancelados: c.cancelados };
  const lista = servicios.filter((s: any) => enFiltroServicio(s, filtro)).sort((a: any, b: any) => fechaLocal(b.fecha).localeCompare(fechaLocal(a.fecha)));
  const onUpdate = (u: any) => setAppts((p: any[]) => p.map((x) => (x.id === u.id ? u : x)));
  const onCrear = (m: any) => setAppts((p: any[]) => [m, ...p]);
  const onBorrar = (id: any) => setAppts((p: any[]) => p.filter((x) => x.id !== id));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.02em] text-slate-950">Servicios</h2>
        <p className="text-sm text-slate-500 mt-1">Atención postventa a clientes: resultado, reprogramación, cancelación y notas.</p>
        <div className="flex gap-2 mt-4">
          {[["servicios", "Servicios"], ["cartuchos", "Cartuchos y filtros"]].map(([id, label]) => (
            <button key={id} onClick={() => setVista(id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${vista === id ? "text-white shadow-sm bg-[#0f172a]" : "bg-white text-slate-600 border border-slate-200"}`}>{label}</button>
          ))}
        </div>
      </div>
      {vista === "cartuchos" ? renderCartuchos() : (<>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {FILTROS.map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`px-1 py-2 rounded-xl text-[11px] font-bold flex flex-col items-center ${filtro === id ? "text-white bg-[#0f172a]" : "text-slate-600 bg-white border border-slate-200"}`}>
              <span>{label}</span><span className="text-lg font-black">{n[id]}</span>
            </button>
          ))}
        </div>
        {lista.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-[#e8edf3] text-sm text-slate-400">No hay servicios en este grupo.</div>
        ) : (
          <div className="space-y-3">
            {lista.map((s: any) => {
              const est = estadoServicio(s), info = ESTADO_SERVICIO[est], cancelado = est === "cancelado", f = fmt(s.fecha);
              return (
                <div key={s.id} className={`bg-white rounded-2xl border border-slate-200 border-l-4 overflow-hidden ${cancelado ? "opacity-70" : ""}`}
                  style={{ borderLeftColor: cancelado ? COLOR_CANCELADA : PALETA_TIPOS.servicio.color }}>
                  <button onClick={() => setAbierto(abierto === s.id ? null : s.id)} className="w-full min-h-[56px] px-4 py-3 flex items-center gap-3 text-left">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: info.dot }} />
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-[15px] truncate ${cancelado ? "text-slate-500" : "text-slate-900"}`}>{s.nombre || "Cliente"}</div>
                      <div className="text-xs text-slate-500 truncate"><span className={cancelado ? "line-through" : ""}><span className="capitalize">{f.fecha}</span>{f.hora ? ` · ${f.hora}` : ""}</span>{s.producto ? ` · ${s.producto}` : ""}</div>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${info.badge}`}>{info.label}</span>
                  </button>
                  {abierto === s.id && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-2">
                      {(s.direccion || s.ciudad) && <div className="text-sm text-slate-700">{[s.direccion, s.ciudad, s.cp].filter(Boolean).join(", ")}</div>}
                      {s.cuenta && <div className="text-xs text-slate-500">Cuenta: {s.cuenta}</div>}
                      {s.notas && <div className="text-xs text-slate-400 italic">"{s.notas}"</div>}
                      <ServicioAccionesV2 s={s} autor={autor} puedeGestionar={puedeGestionar} puedeBorrar={puedeBorrar} appts={appts} productos={productos}
                        genId={genId} onUpdate={onUpdate} onCrear={onCrear} onBorrar={onBorrar} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>)}
    </div>
  );
}
