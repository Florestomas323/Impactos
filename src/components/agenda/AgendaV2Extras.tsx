// ═══ AGENDA v2 — piezas de interfaz (la lógica vive en services/agendaV2.ts) ═══
import { useState } from "react";
import {
  RESULTADOS_CITA_V2, ETIQUETA_RESULTADO, mapsLink, isCancelled, esCita, fechaLocal, localDateTimeValue,
  candidatosCartera, buscarEnCartera, icsEvento, accionesCitaV2,
} from "../../services/agendaV2";

const btn = "text-xs font-bold py-2 px-3 rounded-lg";
const tel = (n: string) => "tel:" + String(n || "").replace(/\D/g, "").slice(-10);
const wa = (n: string) => { let d = String(n || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return "https://wa.me/" + d; };

// ── Acciones de una cita (v2) ───────────────────────────────────────────────
export function CitaAccionesV2({ a, puedeResultado, puedeBorrar, onRegistrarResultado, onEditar, onReprogramar, onCancelar, onBorrar }: any) {
  const [paso, setPaso] = useState<"" | "reprogramar" | "cancelar">("");
  const [fecha, setFecha] = useState(fechaLocal(a.fecha) || localDateTimeValue());
  const [motivo, setMotivo] = useState("");
  const cancelada = isCancelled(a);
  const destino = mapsLink(a);
  const acc = accionesCitaV2(a, !!puedeResultado);   // TLK + cancelada o con resultado = solo lectura
  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500 space-y-0.5">
        {(a.createdByName || a.agente) && <div>Agendada por: <b className="text-slate-700">{a.createdByName || a.agente}</b></div>}
        {a.resultado && <div>Resultado: <b className="text-slate-700">{ETIQUETA_RESULTADO[a.resultado] || a.resultado}</b>{a.resultByName ? <> · Registrado por: <b className="text-slate-700">{a.resultByName}</b></> : null}</div>}
        {cancelada && <div className="text-red-600 font-bold">Cancelada{a.cancelledByName ? ` por ${a.cancelledByName}` : ""}{a.cancelReason ? ` · ${a.cancelReason}` : ""}</div>}
        {Array.isArray(a.reprogramHistory) && a.reprogramHistory.length > 0 && <div>Reprogramada {a.reprogramHistory.length} vez{a.reprogramHistory.length > 1 ? "es" : ""} antes de la visita</div>}
        {a.reprogrammedFromApptId && <div>Viene de una visita reprogramada</div>}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {a.telefono && <a href={tel(a.telefono)} className={btn + " bg-[#EFF6FF] text-[#1D4ED8]"}>Llamar</a>}
        {a.telefono && <a href={wa(a.telefono)} target="_blank" rel="noreferrer" className={btn + " bg-emerald-50 text-emerald-700"}>WhatsApp</a>}
        {destino && <a href={destino} target="_blank" rel="noreferrer" className={btn + " bg-[#F5F3FF] text-[#6D28D9]"}>Cómo llegar</a>}
        {acc.reprogramar && <button onClick={() => setPaso(paso === "reprogramar" ? "" : "reprogramar")} className={btn + " bg-amber-50 text-amber-700"}>Reprogramar</button>}
      </div>
      {paso === "reprogramar" && (
        <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
          <div className="text-[11px] font-bold text-amber-800">Antes de la visita: cambia la fecha de ESTA cita (no cuenta como visita).</div>
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-2 border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" />
          <div className="flex gap-2">
            <button disabled={!fecha || fecha === fechaLocal(a.fecha)} onClick={() => { onReprogramar(fecha); setPaso(""); }} className={btn + " flex-1 text-white disabled:opacity-40"} style={{ background: "#d97706" }}>Guardar nueva fecha</button>
            <button onClick={() => setPaso("")} className={btn + " bg-white text-slate-500"}>Volver</button>
          </div>
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap">
        {acc.registrarResultado && <button onClick={onRegistrarResultado} className={btn + " flex-1"} style={{ background: "#f1ecfd", color: "#1e3a8a" }}>Registrar resultado</button>}
        {acc.editar && <button onClick={onEditar} className={btn + " bg-[#f4f6f9] text-slate-600"}>Editar</button>}
        {acc.cancelar && <button onClick={() => setPaso(paso === "cancelar" ? "" : "cancelar")} className={btn + " bg-red-50 text-red-600"}>Cancelar cita</button>}
      </div>
      {paso === "cancelar" && (
        <div className="p-2.5 rounded-xl border border-red-200 bg-red-50/60 space-y-2">
          <div className="text-[11px] font-bold text-red-700">La cita queda en el historial como Cancelada (no se borra).</div>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full border-2 border-red-200 rounded-lg px-3 py-2 text-sm bg-white" />
          <div className="flex gap-2">
            <button onClick={() => { onCancelar(motivo.trim()); setPaso(""); }} className={btn + " flex-1 text-white"} style={{ background: "#dc2626" }}>Cancelar cita</button>
            <button onClick={() => setPaso("")} className={btn + " bg-white text-slate-500"}>Volver</button>
          </div>
        </div>
      )}
      {puedeBorrar && (
        <button onClick={() => { if (confirm("¿Borrar definitivamente esta cita? No se puede deshacer. (Para el flujo normal usa Cancelar.)")) onBorrar(a.id); }}
          className="text-[11px] font-semibold text-slate-400 underline">Administración: borrar definitivamente</button>
      )}
    </div>
  );
}

// Resultados de visita v2 (solo staff) + "Reprogramada en visita" con nueva fecha obligatoria.
export const RESULTADOS_V2_BOTONES = RESULTADOS_CITA_V2.map((r) => ({ ...r, text: "#fff" }));
export function ReprogramarEnVisitaV2({ onConfirmar, onVolver }: any) {
  const [fecha, setFecha] = useState("");
  return (
    <div className="p-2.5 rounded-xl border-2 border-cyan-300 bg-cyan-50 space-y-2">
      <div className="text-[11px] font-black text-cyan-800 uppercase tracking-wider">Reprogramada en visita — nueva fecha y hora</div>
      <div className="text-[11px] text-cyan-800">Cuenta como visita realizada (no demo). Se crea una cita nueva para esa fecha.</div>
      <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full border-2 border-cyan-300 rounded-lg px-3 py-2 text-sm bg-white" />
      <div className="flex gap-2">
        <button disabled={!fecha} onClick={() => onConfirmar(fecha)} className="flex-1 text-xs font-bold py-2 px-3 rounded-lg text-white disabled:opacity-40" style={{ background: "#0891b2" }}>Guardar y crear nueva cita</button>
        <button onClick={onVolver} className="text-xs font-bold py-2 px-3 rounded-lg bg-white text-slate-500">Volver</button>
      </div>
    </div>
  );
}

// ── "Nueva visita": buscar cliente en MI cartera (o cita manual) ────────────
export function ClientePickerV2({ allData, onElegir, onManual, onCerrar }: any) {
  const [q, setQ] = useState("");
  const [ver, setVer] = useState(30);
  const todos = candidatosCartera(allData);
  const lista = buscarEnCartera(todos, q);
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">Busca el cliente en tu cartera: se llenan sus datos y la cita queda ligada a su registro.</div>
      <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setVer(30); }} placeholder="Nombre, teléfono o ciudad" className="w-full border-2 border-[#e5def4] rounded-xl px-3 py-2.5 text-sm" />
      <div className="max-h-[50vh] overflow-y-auto space-y-1.5">
        {lista.slice(0, ver).map((c: any) => (
          <button key={c.key} onClick={() => onElegir(c)} className="w-full text-left px-3 py-2.5 rounded-xl border border-[#e8edf3] bg-white hover:border-[#93C5FD]">
            <div className="font-bold text-sm text-[#1f2d3d]">{c.nombre || "(sin nombre)"}</div>
            <div className="text-xs text-slate-400">{[c.telefono, [c.ciudad, c.cp].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
          </button>
        ))}
        {lista.length === 0 && <div className="text-center text-sm text-slate-400 py-6">No hay coincidencias en tu cartera.</div>}
        {lista.length > ver && <button onClick={() => setVer(ver + 30)} className="w-full py-2 text-xs font-bold text-slate-500">Ver más ({lista.length - ver})</button>}
      </div>
      <div className="flex gap-2 pt-1 border-t border-[#f1f5f9]">
        <button onClick={onManual} className="flex-1 text-xs font-bold py-2.5 rounded-lg bg-[#f4f6f9] text-slate-600">Cita manual (sin cliente de mi cartera)</button>
        <button onClick={onCerrar} className="text-xs font-bold py-2.5 px-3 rounded-lg text-slate-500">Cerrar</button>
      </div>
    </div>
  );
}

// ── Aviso de posible duplicado (no bloquea) ─────────────────────────────────
export function AvisoDuplicadoV2({ existente, onVolver, onGuardar }: any) {
  const f = fechaLocal(existente?.fecha).replace("T", " ");
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
        <b>Ya existe una cita para este cliente cerca de esa hora.</b>
        <div className="mt-1 text-xs">{existente?.nombre} · {f}{existente?.createdByName ? ` · agendada por ${existente.createdByName}` : ""}</div>
      </div>
      <div className="flex gap-2">
        <button onClick={onVolver} className="flex-1 text-sm font-bold py-2.5 rounded-lg bg-[#f4f6f9] text-slate-700">Volver</button>
        <button onClick={onGuardar} className="flex-1 text-sm font-bold py-2.5 rounded-lg text-white" style={{ background: "#d97706" }}>Guardar de todos modos</button>
      </div>
    </div>
  );
}

// ── Tras guardar: Google Calendar y Apple Calendar (.ics) ───────────────────
export function CalendariosV2({ appt, titulo, gcal }: any) {
  const descargarIcs = () => {
    const blob = new Blob([icsEvento(appt, titulo)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `cita-${String(appt?.nombre || "impactos").replace(/[^\w-]+/g, "_")}.ics`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      <a href={gcal} target="_blank" rel="noreferrer" className="text-xs font-bold py-2 px-3 rounded-lg bg-white border border-emerald-300 text-emerald-700">Google Calendar</a>
      <button onClick={descargarIcs} className="text-xs font-bold py-2 px-3 rounded-lg bg-white border border-emerald-300 text-emerald-700">Apple Calendar</button>
    </div>
  );
}
