// ═══ LLAMADAS v2 — bandeja de trabajo por prioridad (solo telemarketing) ═══
// Toda la lógica vive en src/services/callWorkflow.ts (probada). Aquí solo se
// pinta y se conectan los formularios existentes (AppointmentForm y
// EntrevistaModal, que llegan de App.tsx por props para no duplicarlos).
import { useMemo, useState } from "react";
import { Modal, Field, PrimaryBtn, inpLight } from "../primitives";
import { Ico } from "../../iconos";
import { genId } from "../../utils/ids";
import { asList } from "../../services/assignments";
import { trazaRegistro } from "../../services/apptTrace";
import { citaDesdeLlamada, revisarDuplicado } from "../../services/agendaV2";
import { AvisoDuplicadoV2, CalendariosV2 } from "../agenda/AgendaV2Extras";
import {
  Especialidad, RESULTADOS, PASOS_EN_PROCESO, resultadosPara, ETAPAS, Item, Priorizado, Datos,
  itemsDe, priorizar, kpis, validarResultado, resultadoDe, aplicarResultado, completarSeguimiento, agregarNotaV2, diaLocal, etapaDe,
  Filtros, filtrarItems, sinFiltros, conteoEstados, conteoResultados, opcionesZona, resumenCartera, CATEGORIA_LABEL, PAGINA,
} from "../../services/callWorkflow";

type Props = {
  user: { uid: string; role: string; nombre: string };
  esp: Especialidad;
  state: any;
  setSection: (section: string, fn: any) => void;
  setAppts: (fn: any) => void;
  onCallLog?: () => void;
  gcalLink: (appt: any) => string;
  AppointmentForm: any;
  EntrevistaModal: any;
  estadoLabel: Record<string, { label: string; hex: string }>;
};

const tel = (n: string) => "tel:" + String(n || "").replace(/\D/g, "").slice(-10);
const wa = (n: string) => { let d = String(n || "").replace(/\D/g, ""); if (d.length === 10) d = "1" + d; return "https://wa.me/" + d; };
const maps = (it: Item) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([it.direccion, it.ciudad, it.cp].filter(Boolean).join(", "));
const hace = (iso: string, hoy: string) => { if (!iso) return "nunca"; const d = iso.slice(0, 10); if (d === hoy) return "hoy"; const n = Math.round((new Date(hoy).getTime() - new Date(d).getTime()) / 86400000); return n === 1 ? "ayer" : `hace ${n} días`; };
const fechaCorta = (s: string) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${Number(d)}/${Number(m)}`; };
const ETIQUETA: Record<Especialidad, { cartera: string; productivo: string; flujo: [string, string, string] }> = {
  ventas: { cartera: "Mi cartera", productivo: "Citas hoy", flujo: ["Intentos", "Contactos", "Citas"] },
  cobranza: { cartera: "Mi cartera", productivo: "Compromisos hoy", flujo: ["Intentos", "Contactos", "Compromisos"] },
  reclutamiento: { cartera: "Mis prospectos", productivo: "Entrevistas hoy", flujo: ["Intentos", "Contactos", "Entrevistas"] },
};

export function CallCenterV2({ user, esp, state, setSection, setAppts, onCallLog, gcalLink, AppointmentForm, EntrevistaModal, estadoLabel }: Props) {
  const hoy = diaLocal(new Date());
  const autor = { uid: user.uid, nombre: user.nombre };
  const items = useMemo(() => itemsDe(state, esp, user.uid), [state, esp, user.uid]);
  const prio = useMemo(() => priorizar(items, esp), [items, esp]);
  const k: any = useMemo(() => kpis(items, esp, user.uid), [items, esp, user.uid]);

  const TABS = esp === "cobranza"
    ? [["todos", "Todos"], ["prioridad", "Prioridad"], ["promesas", "Promesas"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["zonas", "Zonas"]]
    : esp === "reclutamiento"
    ? [["todos", "Todos"], ["prioridad", "Prioridad"], ["nuevos", "Nuevos"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["etapas", "Etapas"]]
    : [["todos", "Todos"], ["prioridad", "Prioridad"], ["nuevos", "Nuevos"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["estados", "Estados"], ["zonas", "Zonas"]];
  const [tab, setTab] = useState("prioridad");
  // Filtros combinables (intersección) sobre la cartera real: texto, estados, último resultado, ciudades, ZIPs (+ etapas en Reclutamiento).
  const [q, setQ] = useState("");
  const [estadosSel, setEstadosSel] = useState<string[]>([]);
  const [resultadosSel, setResultadosSel] = useState<string[]>([]);
  const [ciudadesSel, setCiudadesSel] = useState<string[]>([]);
  const [zipsSel, setZipsSel] = useState<string[]>([]);
  const [etapasSel, setEtapasSel] = useState<string[]>([]);
  const [ver, setVer] = useState(PAGINA);
  const filtros: Filtros = { q, estados: estadosSel, resultados: resultadosSel, ciudades: ciudadesSel, zips: zipsSel };
  const hayFiltros = !sinFiltros(filtros) || etapasSel.length > 0;
  const limpiarFiltros = () => { setQ(""); setEstadosSel([]); setResultadosSel([]); setCiudadesSel([]); setZipsSel([]); setEtapasSel([]); setVer(PAGINA); setTab("todos"); };
  const alternar = (arr: string[], set: (v: string[]) => void, v: string) => { set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]); setVer(PAGINA); };
  const [abierto, setAbierto] = useState<string | null>(null);
  const [resModal, setResModal] = useState<{ it: Item; id?: string } | null>(null);
  const [datos, setDatos] = useState<Datos>({});
  const [error, setError] = useState("");
  const [notaModal, setNotaModal] = useState<Item | null>(null); const [nota, setNota] = useState("");
  const [citaDe, setCitaDe] = useState<{ it: Item; nota?: string } | null>(null);
  const [entrevistaDe, setEntrevistaDe] = useState<{ it: Item; nota?: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const [dupCita, setDupCita] = useState<{ appt: any; existente: any } | null>(null);   // posible cita duplicada
  const [citaGuardada, setCitaGuardada] = useState<any>(null);                         // → Google / Apple Calendar

  // ── Escritura: siempre sobre el registro real (referido dentro de su anfitrión; cobranza en clientesData) ──
  const actualizar = (it: Item, fn: (r: any) => any) => {
    if (it.section === "referidos") {
      setSection("referidos", (p: any[]) => p.map((anf: any) => {
        if (String(anf.id) !== it.recId) return anf;
        const refs = anf.referidos;
        if (Array.isArray(refs)) return { ...anf, referidos: refs.map((r: any, i: number) => (i === it.refIdx ? fn(r) : r)) };
        const clave = Object.keys(refs || {})[it.refIdx as number];
        return clave === undefined ? anf : { ...anf, referidos: { ...refs, [clave]: fn(refs[clave]) } };
      }));
    } else if (it.section === "cobranza") {
      setSection("cobranza", (c: any) => ({ ...c, clientesData: { ...(c?.clientesData || {}), [it.recId]: fn((c?.clientesData || {})[it.recId] || {}) } }));
    } else {
      setSection(it.section, (p: any[]) => p.map((x: any) => (String(x.id) === it.recId ? fn(x) : x)));
    }
  };
  const guardarResultado = (it: Item, id: string, d: Datos) => {
    actualizar(it, (r) => aplicarResultado(r, esp, id, d, autor));
    setAviso(`${it.nombre}: ${resultadoDe(esp, id)?.label}`);
  };

  // ── Flujo de resultado ──
  const abrirResultado = (it: Item, id?: string) => { setResModal({ it, id }); setDatos({}); setError(""); };
  const confirmarResultado = () => {
    if (!resModal?.id) return;
    const r = resultadoDe(esp, resModal.id)!;
    if (r.requiere === "cita") { setCitaDe({ it: resModal.it, nota: datos.nota }); setResModal(null); return; }
    if (r.requiere === "entrevista") { setEntrevistaDe({ it: resModal.it, nota: datos.nota }); setResModal(null); return; }
    const e = validarResultado(esp, resModal.id, datos, resModal.it.raw);
    if (e) { setError(e); return; }
    guardarResultado(resModal.it, resModal.id, datos);
    setResModal(null);
  };
  // Cita desde un registro: trazabilidad + NO se asigna al TLK (createdByUid lo pone el sistema central)
  const guardarCita = (appt: any, forzar = false) => {
    const it = citaDe!.it;
    const nueva = citaDesdeLlamada(appt, trazaRegistro(it), genId());
    const existente = revisarDuplicado(state?.appts, nueva, forzar);   // aviso, nunca bloqueo
    if (existente) { setDupCita({ appt, existente }); return; }
    setDupCita(null);
    const conAutor = { ...nueva, createdByName: user.nombre };
    try { window.open(gcalLink(conAutor), "_blank"); } catch {}
    setAppts((p: any[]) => [nueva, ...p]);
    guardarResultado(it, "cita_agendada", { nota: [citaDe!.nota, appt.notas].filter(Boolean).join(" · "), fechaCita: appt.fecha });
    setCitaDe(null);
    setCitaGuardada(conAutor);
  };
  const guardarEntrevista = (dd: any) => {
    const it = entrevistaDe!.it;
    const appt = { id: genId(), tipo: "entrevista", _type: "entrevista", nombre: dd.nombre, telefono: dd.telefono, fecha: dd.fecha, notas: dd.notas, attendees: dd.attendees, agente: user.nombre, ...trazaRegistro(it) };
    setAppts((p: any[]) => [appt, ...p]);
    try { window.open(gcalLink(appt), "_blank"); } catch {}
    guardarResultado(it, "entrevista_agendada", { nota: [entrevistaDe!.nota, dd.notas].filter(Boolean).join(" · "), fechaCita: dd.fecha });
    setEntrevistaDe(null);
  };

  // ── Listas por pestaña ──
  const conMotivo = (it: Item, motivo: string): Priorizado => ({ ...it, rank: 9, motivo });
  const lista: Priorizado[] = useMemo(() => {
    if (tab === "prioridad") return prio;
    if (tab === "nuevos") return items.filter((i) => !i.cerrado && !i.invalido && !i.ultimoContacto && (esp !== "reclutamiento" || i.etapa === "nuevo")).map((i) => conMotivo(i, "Nunca llamado"));
    if (tab === "seguimientos") return items.filter((i) => i.proximo && !i.cerrado).sort((a, b) => a.proximo.localeCompare(b.proximo))
      .map((i) => conMotivo(i, i.proximo < hoy ? `Vencido · ${fechaCorta(i.proximo)}` : i.proximo === hoy ? "Seguimiento hoy" : `Seguimiento ${fechaCorta(i.proximo)}`));
    if (tab === "promesas") return items.filter((i) => i.promesa).sort((a, b) => (a.promesa || "").localeCompare(b.promesa || "")).map((i) => conMotivo(i, `Promesa ${fechaCorta(i.promesa!)}`));
    if (tab === "hoy") return items.filter((i) => (i.raw.ultimo_llamado || "").slice(0, 10) === hoy || (i.ultimoContacto || "").slice(0, 10) === hoy).map((i) => conMotivo(i, `Trabajado hoy · ${resultadoDe(esp, i.raw.ultimoResultado)?.label || "registrado"}`));
    // "todos", "estados", "zonas", "etapas": TODA la cartera asignada; la razón de prioridad se conserva si la tiene
    const razon = new Map(prio.map((p) => [p.key, p.motivo]));
    return items.map((i) => conMotivo(i, razon.get(i.key) || ""));
  }, [tab, prio, items, esp, hoy]);
  const filtrada = filtrarItems(lista, filtros).filter((i) => !etapasSel.length || etapasSel.includes(i.etapa || etapaDe(i.raw)));
  // Conteos "facetados": cada selector cuenta sobre los OTROS filtros activos (sin contarse a sí mismo).
  const catalogoEstados = Object.keys(estadoLabel);
  const baseEstados = filtrarItems(items, { ...filtros, estados: [] });
  const baseResultados = filtrarItems(items, { ...filtros, resultados: [] });
  const baseZonas = filtrarItems(items, { ...filtros, ciudades: [], zips: [] });
  const zonas = opcionesZona(baseZonas);
  const resumen = resumenCartera(items, prio, esp);
  const selectorSinEleccion = (tab === "estados" && !estadosSel.length && !resultadosSel.length) || (tab === "zonas" && !ciudadesSel.length && !zipsSel.length) || (tab === "etapas" && !etapasSel.length);

  // ── Tarjeta ──
  const Tarjeta = ({ it }: { it: Priorizado }) => {
    const exp = abierto === it.key;
    const est = estadoLabel[it.estado];
    const hist = (it.section === "cobranza" ? asList(it.raw.gestiones) : asList(it.raw.historial)).filter(Boolean).slice(-8).reverse();
    const urgente = it.rank === 1 || it.rank === 2 || /Promesa incumplida/.test(it.motivo);
    return (
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
        <div className="flex items-start justify-between gap-2">
          <button className="text-left min-w-0 flex-1" onClick={() => setAbierto(exp ? null : it.key)}>
            <div className="font-black text-[15px] text-[#111827] truncate uppercase tracking-tight">{it.nombre}</div>
            {it.motivo && <div className={`text-xs font-bold mt-0.5 ${urgente ? "text-[#B45309]" : "text-[#6D28D9]"}`}>{it.motivo}</div>}
            <div className="text-xs text-[#667085] mt-1 truncate">{[it.fuente + (it.anfitrion ? ` de ${it.anfitrion}` : ""), [it.ciudad, it.cp].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
          </button>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {esp === "reclutamiento"
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#6D28D9]">{ETAPAS.find((e) => e.id === it.etapa)?.label}</span>
              : esp === "ventas" && est ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: est.hex }}>{est.label}</span> : null}
            {it.promesa && <span className="text-[10px] font-bold text-[#047857]">Promesa {fechaCorta(it.promesa)}</span>}
          </div>
        </div>
        {it.ultimaNota && <div className="mt-2 text-[13px] text-[#334155] bg-[#F8FAFC] rounded-lg px-3 py-2 line-clamp-2">“{it.ultimaNota}”</div>}
        <div className="mt-2 text-[11px] text-[#94A3B8]">Último contacto: {hace(it.ultimoContacto, hoy)}{it.proximo ? ` · Próximo: ${fechaCorta(it.proximo)}${it.raw.seguimiento_hora ? " " + it.raw.seguimiento_hora : ""}` : ""}{it.telefono ? ` · ${it.telefono}` : ""}</div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <a href={tel(it.telefono)} onClick={() => onCallLog && onCallLog()} className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold text-white ${it.telefono ? "" : "opacity-40 pointer-events-none"}`} style={{ background: "#2563EB" }}><Ico e="📞" size={15} />Llamar</a>
          <button onClick={() => abrirResultado(it)} className="py-3 rounded-xl text-sm font-bold border border-[#E2E8F0] text-[#111827] bg-white">Resultado</button>
          {esp === "ventas" && <button onClick={() => setCitaDe({ it })} className="py-3 rounded-xl text-sm font-bold border border-[#DDD6FE] text-[#6D28D9] bg-[#F5F3FF]">Agendar visita</button>}
          {esp === "cobranza" && <button onClick={() => abrirResultado(it, "compromiso_pago")} className="py-3 rounded-xl text-sm font-bold border border-[#BBF7D0] text-[#047857] bg-[#F0FDF4]">Compromiso</button>}
          {esp === "reclutamiento" && <button onClick={() => setEntrevistaDe({ it })} className="py-3 rounded-xl text-sm font-bold border border-[#99F6E4] text-[#0F766E] bg-[#F0FDFA]">Entrevista</button>}
        </div>
        {exp && (
          <div className="mt-3 pt-3 border-t border-[#EEF1F5] space-y-2">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { setNotaModal(it); setNota(""); }} className="text-xs font-bold px-3 py-2 rounded-lg border border-[#E2E8F0]">Nota</button>
              {it.telefono && <a href={wa(it.telefono)} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-2 rounded-lg border border-[#E2E8F0]">WhatsApp</a>}
              {(it.direccion || it.ciudad) && <a href={maps(it)} target="_blank" rel="noreferrer" className="text-xs font-bold px-3 py-2 rounded-lg border border-[#E2E8F0]">Mapa</a>}
              {it.proximo && <button onClick={() => { actualizar(it, (r) => completarSeguimiento(r, esp, autor)); setAviso(`${it.nombre}: seguimiento completado`); }} className="text-xs font-bold px-3 py-2 rounded-lg border border-[#BBF7D0] text-[#047857]">Completar seguimiento</button>}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">Historial</div>
            {hist.length === 0 ? <div className="text-xs text-[#94A3B8]">Sin actividad registrada.</div> : hist.map((h: any, i: number) => (
              <div key={h.id || i} className="text-xs text-[#334155]">
                <b>{fechaCorta(String(h.fecha || ""))}</b> · {resultadoDe(esp, h.resultadoLlamada)?.label || (h.tipo === "nota" ? "Nota" : h.tipo === "seguimiento_completado" ? "Seguimiento completado" : h.tipo === "promesa" ? "Promesa" : h.tipo === "pago" ? "Pago" : h.tipo || "registro")}
                {h.agente ? ` · ${h.agente}` : ""}{h.notas ? ` — ${h.notas}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const res = resModal?.id ? resultadoDe(esp, resModal.id) : null;
  const L = ETIQUETA[esp];
  const cuatro = esp === "cobranza"
    ? [[L.cartera, k.cartera], ["Pendientes", k.pendientes], ["Seguimientos hoy", k.seguimientosHoy], ["Vencidos", k.vencidos], [L.productivo, k.productivosHoy]]
    : esp === "reclutamiento"
    ? [[L.cartera, k.cartera], ["Por contactar", k.porContactar], ["Seguimientos", k.seguimientos], [L.productivo, k.productivosHoy]]
    : [[L.cartera, k.cartera], ["Seguimientos hoy", k.seguimientosHoy], ["Vencidos", k.vencidos], [L.productivo, k.productivosHoy]];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#111827]">Llamadas</h1>
        <div className="text-sm text-[#667085]">{esp === "ventas" ? "Tu meta: convertir datos en visitas." : esp === "cobranza" ? "Tu meta: contacto y compromiso de pago." : "Tu meta: prospecto → entrevista → nuevo socio."}</div>
      </div>

      <section className={`grid grid-cols-2 ${cuatro.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-2`}>
        {cuatro.map(([t, n]: any, i: number) => i === 0 ? (
          <button key={t} onClick={() => { setTab("todos"); setVer(PAGINA); }} className="text-left bg-white rounded-2xl border border-[#C7D2FE] p-3 hover:border-[#2563EB] transition">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#2563EB]">{t} ›</div>
            <div className="text-2xl font-black text-[#111827]">{n}</div>
          </button>
        ) : (
          <div key={t} className="bg-white rounded-2xl border border-[#E5E7EB] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{t}</div>
            <div className="text-2xl font-black text-[#111827]">{n}</div>
          </div>
        ))}
      </section>

      {/* Dónde está cada registro de la cartera (una categoría por registro) */}
      <div className="text-[13px] text-[#475569] flex flex-wrap gap-x-3 gap-y-1">
        {(["prioridad", "cita", "seguimientoFuturo", "cerrado", "invalido", "sinDatos", "otros"] as const).filter((c) => (resumen as any)[c] > 0).map((c) => (
          <span key={c}><b className="text-[#111827]">{(resumen as any)[c]}</b> {CATEGORIA_LABEL[c]}</span>
        ))}
      </div>

      <section className="bg-white rounded-2xl border border-[#E5E7EB] p-3 flex items-center gap-2 flex-wrap text-sm">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#667085] mr-1">Hoy</span>
        <b>{k.m.intentos}</b> {L.flujo[0].toLowerCase()} <span className="text-[#A07CFF] font-black">›</span>
        <b>{k.m.contactos}</b> {L.flujo[1].toLowerCase()} <span className="text-[#A07CFF] font-black">›</span>
        <b>{k.m.productivos}</b> {L.flujo[2].toLowerCase()}
        <span className="ml-auto text-xs text-[#667085]">{L.flujo[1].toLowerCase()} → {L.flujo[2].toLowerCase()}: <b className="text-[#111827]">{k.m.conversion}%</b></span>
        {k.m.sinClasificar > 0 && <span className="w-full text-[11px] text-[#94A3B8]">{k.m.sinClasificar} registro(s) de hoy sin clasificar (formato anterior: no se cuentan como llamada).</span>}
      </section>

      {esp === "cobranza" && items.some((i) => i.sinDatos) && (
        <div className="text-[13px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
          {items.filter((i) => i.sinDatos).length} cuenta(s) sin nombre ni teléfono: pide a Cobranza que complete sus datos de contacto.
        </div>
      )}
      {aviso && <div className="text-sm font-bold rounded-xl px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200 flex justify-between"><span>✓ {aviso}</span><button onClick={() => setAviso("")}>×</button></div>}
      {citaGuardada && <div className="text-xs rounded-xl px-3 py-2 text-emerald-800 bg-emerald-50 border border-emerald-200">
        <div className="flex justify-between font-bold"><span>Cita de {citaGuardada.nombre}: agregar a tu calendario</span><button onClick={() => setCitaGuardada(null)}>×</button></div>
        <CalendariosV2 appt={citaGuardada} titulo={`📋 Cita - ${citaGuardada.nombre}`} gcal={gcalLink(citaGuardada)} />
      </div>}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(([id, t]) => (
          <button key={id} onClick={() => { setTab(id); setVer(40); }}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold ${tab === id ? "text-white" : "text-[#475569] bg-white border border-[#E2E8F0]"}`}
            style={tab === id ? { background: "#2563EB" } : undefined}>{t}{id === "prioridad" ? ` ${prio.length}` : id === "todos" ? ` ${items.length}` : ""}</button>
        ))}
      </div>
      <input className={inpLight} placeholder="Buscar nombre, teléfono o cuenta" value={q} onChange={(e) => { setQ(e.target.value); setVer(PAGINA); }} />
      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-[#667085] mr-1">Filtros:</span>
          {estadosSel.map((e) => <span key={"e" + e} className="px-2 py-1 rounded-lg bg-[#EEF2FF] text-[#3730A3] font-bold">{estadoLabel[e]?.label || e}</span>)}
          {resultadosSel.map((r) => <span key={"r" + r} className="px-2 py-1 rounded-lg bg-[#F5F3FF] text-[#6D28D9] font-bold">Último: {resultadoDe(esp, r)?.label || r}</span>)}
          {ciudadesSel.map((c) => <span key={"c" + c} className="px-2 py-1 rounded-lg bg-[#EEF2FF] text-[#3730A3] font-bold">{zonas.find((z) => z.clave === c)?.nombre || c}</span>)}
          {zipsSel.map((z) => <span key={"z" + z} className="px-2 py-1 rounded-lg bg-[#EEF2FF] text-[#3730A3] font-bold">{z}</span>)}
          {etapasSel.map((e) => <span key={"t" + e} className="px-2 py-1 rounded-lg bg-[#F5F3FF] text-[#6D28D9] font-bold">{ETAPAS.find((x) => x.id === e)?.label || e}</span>)}
          {q.trim() && <span className="px-2 py-1 rounded-lg bg-[#F1F5F9] text-[#334155] font-bold">“{q.trim()}”</span>}
          <button onClick={limpiarFiltros} className="ml-auto px-3 py-1.5 rounded-lg border border-[#E2E8F0] bg-white font-bold text-[#111827]">Limpiar filtros</button>
        </div>
      )}

      {tab === "estados" && (
        <section className="bg-white rounded-2xl border border-[#E5E7EB] p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Estado del cliente</div>
            <div className="flex gap-2">
              <button onClick={() => { setEstadosSel(conteoEstados(baseEstados, catalogoEstados).filter((x) => x.n > 0).map((x) => x.id)); setVer(PAGINA); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">Todos los estados</button>
              {estadosSel.length > 0 && <button onClick={() => { setEstadosSel([]); setVer(PAGINA); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">Limpiar selección</button>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {conteoEstados(baseEstados, catalogoEstados).map(({ id, n }) => {
              const on = estadosSel.includes(id), e = estadoLabel[id];
              return (
                <button key={id} onClick={() => alternar(estadosSel, setEstadosSel, id)} disabled={n === 0 && !on}
                  className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border text-[13px] font-bold transition ${on ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E3A8A]" : n === 0 ? "border-[#F1F5F9] text-[#CBD5E1] bg-white" : "border-[#E2E8F0] text-[#111827] bg-white hover:border-[#93C5FD]"}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e?.hex || "#94A3B8", opacity: n === 0 && !on ? 0.35 : 1 }} />
                  <span className="flex-1 leading-tight">{e?.label || id}</span><span className="tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] pt-1">Último resultado de llamada</div>
          <div className="flex flex-wrap gap-1.5">
            {conteoResultados(baseResultados, esp).map(({ id, label, n }) => {
              const on = resultadosSel.includes(id);
              return (
                <button key={id} onClick={() => alternar(resultadosSel, setResultadosSel, id)} disabled={n === 0 && !on}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${on ? "border-[#7C3AED] bg-[#F5F3FF] text-[#5B21B6]" : n === 0 ? "border-[#F1F5F9] text-[#CBD5E1]" : "border-[#E2E8F0] text-[#334155]"}`}>{label} · {n}</button>
              );
            })}
          </div>
        </section>
      )}

      {tab === "zonas" && (
        <section className="bg-white rounded-2xl border border-[#E5E7EB] p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">Ciudades</div>
            {(ciudadesSel.length > 0 || zipsSel.length > 0) && <button onClick={() => { setCiudadesSel([]); setZipsSel([]); setVer(PAGINA); }} className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">Limpiar selección</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {zonas.map((z) => {
              const on = ciudadesSel.includes(z.clave);
              return (
                <button key={z.clave} onClick={() => { alternar(ciudadesSel, setCiudadesSel, z.clave); if (on) setZipsSel(zipsSel.filter((zz) => !z.zips.some((x) => x.zip === zz))); }}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[13px] font-bold ${on ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E3A8A]" : "border-[#E2E8F0] text-[#111827] bg-white hover:border-[#93C5FD]"}`}>
                  <span className="truncate">{z.nombre}</span><span className="tabular-nums">{z.n}</span>
                </button>
              );
            })}
            {zonas.length === 0 && <div className="text-sm text-[#94A3B8]">Sin ciudades en tu cartera.</div>}
          </div>
          {ciudadesSel.length > 0 && zonas.filter((z) => ciudadesSel.includes(z.clave)).map((z) => z.zips.length > 0 && (
            <div key={"zz" + z.clave}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-1.5">ZIP de {z.nombre}</div>
              <div className="flex flex-wrap gap-1.5">
                {z.zips.map(({ zip, n }) => {
                  const on = zipsSel.includes(zip);
                  return <button key={zip} onClick={() => alternar(zipsSel, setZipsSel, zip)} className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold ${on ? "border-[#7C3AED] bg-[#F5F3FF] text-[#5B21B6]" : "border-[#E2E8F0] text-[#334155]"}`}>{zip} · {n}</button>;
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "etapas" && (
        <section className="bg-white rounded-2xl border border-[#E5E7EB] p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-2">Etapa del candidato</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ETAPAS.map((e) => {
              const n = filtrarItems(items, filtros).filter((i) => (i.etapa || etapaDe(i.raw)) === e.id).length, on = etapasSel.includes(e.id);
              return <button key={e.id} onClick={() => alternar(etapasSel, setEtapasSel, e.id)} disabled={n === 0 && !on}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-[13px] font-bold ${on ? "border-[#2563EB] bg-[#EFF6FF] text-[#1E3A8A]" : n === 0 ? "border-[#F1F5F9] text-[#CBD5E1]" : "border-[#E2E8F0] text-[#111827]"}`}>
                <span>{e.label}</span><span className="tabular-nums">{n}</span></button>;
            })}
          </div>
        </section>
      )}

      {selectorSinEleccion ? (
        <div className="text-center py-6 text-sm text-[#94A3B8]">Elige {tab === "zonas" ? "una o más ciudades" : tab === "etapas" ? "una o más etapas" : "uno o más estados"} para ver sus clientes.</div>
      ) : (
        <div className="space-y-2">
          {["estados", "zonas", "etapas"].includes(tab) && <div className="text-sm font-bold text-[#111827]">{filtrada.length} cliente{filtrada.length !== 1 ? "s" : ""} seleccionado{filtrada.length !== 1 ? "s" : ""}</div>}
          {filtrada.slice(0, ver).map((it) => <Tarjeta key={it.key} it={it} />)}
          {filtrada.length === 0 && <div className="text-center py-10 text-sm text-[#94A3B8]">{tab === "prioridad" && !hayFiltros ? "Nada urgente por ahora. Revisa Todos, Nuevos o Seguimientos." : "No hay registros con estos filtros."}</div>}
          {filtrada.length > ver && <button onClick={() => setVer(ver + PAGINA)} className="w-full py-3 rounded-xl text-sm font-bold border border-[#E2E8F0] bg-white">Ver más ({filtrada.length - ver})</button>}
        </div>
      )}

      {/* Registrar resultado */}
      {resModal && (
        <Modal title={`Resultado · ${resModal.it.nombre}`} onClose={() => setResModal(null)}>
          {!resModal.id ? (
            <div className="grid grid-cols-1 gap-2">
              {resultadosPara(esp, resModal.it.raw).map((r) => (
                <button key={r.id} onClick={() => { setResModal({ ...resModal, id: r.id }); setError(""); }}
                  className="w-full text-left px-4 py-3.5 rounded-xl text-sm font-bold text-white" style={{ background: r.color }}>{r.label}</button>
              ))}
            </div>
          ) : (
            <div>
              <div className="text-base font-black mb-3" style={{ color: res!.color }}>{res!.label}</div>
              {res!.requiere === "fecha_paso" && (
                <Field label="Próximo paso" required>
                  <div className="grid grid-cols-1 gap-2">
                    {PASOS_EN_PROCESO.map((p) => (
                      <button key={p.id} onClick={() => setDatos({ ...datos, paso: p.id })} className={`px-3 py-2.5 rounded-lg text-sm font-bold border ${datos.paso === p.id ? "text-white border-transparent" : "border-[#E2E8F0]"}`} style={datos.paso === p.id ? { background: "#7c3aed" } : undefined}>{p.label}</button>
                    ))}
                  </div>
                </Field>
              )}
              {["fecha", "fecha_paso", "compromiso"].includes(res!.requiere as string) && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={res!.requiere === "compromiso" ? "Fecha prometida" : "Fecha de seguimiento"} required><input type="date" className={inpLight} min={hoy} value={datos.fecha || ""} onChange={(e) => setDatos({ ...datos, fecha: e.target.value })} /></Field>
                  {res!.requiere === "compromiso"
                    ? <Field label="Monto (si se sabe)"><input className={inpLight} inputMode="decimal" value={datos.monto || ""} onChange={(e) => setDatos({ ...datos, monto: e.target.value })} /></Field>
                    : <Field label="Hora (opcional)"><input type="time" className={inpLight} value={datos.hora || ""} onChange={(e) => setDatos({ ...datos, hora: e.target.value })} /></Field>}
                </div>
              )}
              {["cita", "entrevista"].includes(res!.requiere as string) && <div className="text-sm text-[#667085] mb-2">Al continuar se abre el formulario de {res!.requiere === "cita" ? "la visita" : "la entrevista"} con los datos ya cargados.</div>}
              <Field label="Nota"><textarea className={inpLight} rows={3} value={datos.nota || ""} onChange={(e) => setDatos({ ...datos, nota: e.target.value })} placeholder="Qué dijo, cuándo llamar, etc." /></Field>
              {error && <div className="text-sm font-bold text-red-700 mb-2">{error}</div>}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setResModal({ it: resModal.it })} className="py-3 rounded-xl text-sm font-bold border border-[#E2E8F0]">Cambiar</button>
                <PrimaryBtn onClick={confirmarResultado}>{["cita", "entrevista"].includes(res!.requiere as string) ? "Continuar" : "Guardar"}</PrimaryBtn>
              </div>
            </div>
          )}
        </Modal>
      )}

      {notaModal && (
        <Modal title={`Nota · ${notaModal.nombre}`} onClose={() => setNotaModal(null)}>
          <textarea className={inpLight} rows={4} value={nota} onChange={(e) => setNota(e.target.value)} autoFocus />
          <div className="mt-3"><PrimaryBtn full disabled={!nota.trim()} onClick={() => { const it = notaModal; actualizar(it, (r) => agregarNotaV2(r, nota, autor, esp)); setNotaModal(null); setAviso(`${it.nombre}: nota guardada`); }}>Guardar nota</PrimaryBtn></div>
        </Modal>
      )}

      {citaDe && (
        <Modal title={`Agendar visita · ${citaDe.it.nombre}`} onClose={() => { setCitaDe(null); setDupCita(null); }}>
          {/* El formulario sigue montado (oculto) durante el aviso: "Volver" conserva lo escrito. */}
          {dupCita && <AvisoDuplicadoV2 existente={dupCita.existente} onVolver={() => setDupCita(null)} onGuardar={() => guardarCita(dupCita.appt, true)} />}
          <div style={dupCita ? { display: "none" } : undefined}><AppointmentForm client={{ ...citaDe.it.raw, nombre: citaDe.it.nombre, telefono: citaDe.it.telefono, direccion: citaDe.it.direccion, ciudad: citaDe.it.ciudad, cp: citaDe.it.cp }}
            forceTipo="cita" agenteActivo={user.nombre} onSave={(a: any) => guardarCita(a)} onClose={() => setCitaDe(null)} /></div>
        </Modal>
      )}
      {entrevistaDe && <EntrevistaModal prospecto={entrevistaDe.it.raw} agente={user.nombre} onSave={guardarEntrevista} onClose={() => setEntrevistaDe(null)} />}
    </div>
  );
}
