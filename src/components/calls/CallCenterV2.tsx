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
import {
  Especialidad, RESULTADOS, PASOS_EN_PROCESO, resultadosPara, ETAPAS, Item, Priorizado, Datos,
  itemsDe, priorizar, kpis, validarResultado, resultadoDe, aplicarResultado, completarSeguimiento, agregarNotaV2, diaLocal, etapaDe,
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
    ? [["prioridad", "Prioridad"], ["promesas", "Promesas"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["zonas", "Zonas"]]
    : esp === "reclutamiento"
    ? [["prioridad", "Prioridad"], ["nuevos", "Nuevos"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["etapas", "Etapas"]]
    : [["prioridad", "Prioridad"], ["nuevos", "Nuevos"], ["seguimientos", "Seguimientos"], ["hoy", "Trabajados hoy"], ["estados", "Estados"], ["zonas", "Zonas"]];
  const [tab, setTab] = useState("prioridad");
  const [q, setQ] = useState(""); const [ciudad, setCiudad] = useState(""); const [zip, setZip] = useState("");
  const [ver, setVer] = useState(40);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [resModal, setResModal] = useState<{ it: Item; id?: string } | null>(null);
  const [datos, setDatos] = useState<Datos>({});
  const [error, setError] = useState("");
  const [notaModal, setNotaModal] = useState<Item | null>(null); const [nota, setNota] = useState("");
  const [citaDe, setCitaDe] = useState<{ it: Item; nota?: string } | null>(null);
  const [entrevistaDe, setEntrevistaDe] = useState<{ it: Item; nota?: string } | null>(null);
  const [aviso, setAviso] = useState("");

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
  const guardarCita = (appt: any) => {
    const it = citaDe!.it;
    try { window.open(gcalLink(appt), "_blank"); } catch {}
    setAppts((p: any[]) => [{ ...appt, ...trazaRegistro(it), id: genId(), _type: appt.tipo }, ...p]);
    guardarResultado(it, "cita_agendada", { nota: [citaDe!.nota, appt.notas].filter(Boolean).join(" · "), fechaCita: appt.fecha });
    setCitaDe(null);
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
  const filtro = (it: Item) => {
    const t = q.trim().toLowerCase(), d = q.replace(/\D/g, "");
    if (t && !(it.nombre.toLowerCase().includes(t) || it.ciudad.toLowerCase().includes(t) || (d.length >= 3 && it.telefono.replace(/\D/g, "").includes(d)) || String(it.raw.cuenta || it.raw.nroCuenta || "").toLowerCase().includes(t))) return false;
    if (ciudad && !it.ciudad.toLowerCase().includes(ciudad.toLowerCase())) return false;
    if (zip.replace(/\D/g, "").length === 5 && String(it.cp).replace(/\D/g, "").slice(0, 5) !== zip.replace(/\D/g, "").slice(0, 5)) return false;
    return true;
  };
  const conMotivo = (it: Item, motivo: string): Priorizado => ({ ...it, rank: 9, motivo });
  const lista: Priorizado[] = useMemo(() => {
    if (tab === "prioridad") return prio;
    if (tab === "nuevos") return items.filter((i) => !i.cerrado && !i.invalido && !i.ultimoContacto && (esp !== "reclutamiento" || i.etapa === "nuevo")).map((i) => conMotivo(i, "Nunca llamado"));
    if (tab === "seguimientos") return items.filter((i) => i.proximo && !i.cerrado).sort((a, b) => a.proximo.localeCompare(b.proximo))
      .map((i) => conMotivo(i, i.proximo < hoy ? `Vencido · ${fechaCorta(i.proximo)}` : i.proximo === hoy ? "Seguimiento hoy" : `Seguimiento ${fechaCorta(i.proximo)}`));
    if (tab === "promesas") return items.filter((i) => i.promesa).sort((a, b) => (a.promesa || "").localeCompare(b.promesa || "")).map((i) => conMotivo(i, `Promesa ${fechaCorta(i.promesa!)}`));
    if (tab === "hoy") return items.filter((i) => (i.raw.ultimo_llamado || "").slice(0, 10) === hoy || (i.ultimoContacto || "").slice(0, 10) === hoy).map((i) => conMotivo(i, `Trabajado hoy · ${resultadoDe(esp, i.raw.ultimoResultado)?.label || "registrado"}`));
    return items.map((i) => conMotivo(i, ""));
  }, [tab, prio, items, esp, hoy]);
  const filtrada = lista.filter(filtro);
  const grupos = (clave: (i: Item) => string) => {
    const g: Record<string, Priorizado[]> = {};
    filtrada.forEach((i) => { const c = clave(i) || "Sin dato"; (g[c] = g[c] || []).push(i); });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
  };

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
        {cuatro.map(([t, n]: any) => (
          <div key={t} className="bg-white rounded-2xl border border-[#E5E7EB] p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{t}</div>
            <div className="text-2xl font-black text-[#111827]">{n}</div>
          </div>
        ))}
      </section>

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

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(([id, t]) => (
          <button key={id} onClick={() => { setTab(id); setVer(40); }}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold ${tab === id ? "text-white" : "text-[#475569] bg-white border border-[#E2E8F0]"}`}
            style={tab === id ? { background: "#2563EB" } : undefined}>{t}{id === "prioridad" ? ` ${prio.length}` : ""}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className={inpLight + " col-span-3 sm:col-span-1"} placeholder="Buscar nombre, teléfono o cuenta" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className={inpLight + " col-span-2 sm:col-span-1"} placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
        <input className={inpLight} placeholder="ZIP" inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} />
      </div>

      {["estados", "zonas", "etapas"].includes(tab) ? (
        <div className="space-y-4">
          {grupos((i) => tab === "estados" ? (estadoLabel[i.estado]?.label || i.estado) : tab === "etapas" ? (ETAPAS.find((e) => e.id === (i.etapa || etapaDe(i.raw)))?.label || "") : (i.ciudad || "").trim()).map(([g, arr]) => (
            <div key={g}>
              <div className="text-xs font-black uppercase tracking-wider text-[#667085] mb-2">{g} · {arr.length}</div>
              <div className="space-y-2">{arr.slice(0, 20).map((it) => <Tarjeta key={it.key} it={it} />)}</div>
              {arr.length > 20 && <div className="text-[11px] text-[#94A3B8] mt-1">+{arr.length - 20} más (usa el buscador)</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrada.slice(0, ver).map((it) => <Tarjeta key={it.key} it={it} />)}
          {filtrada.length === 0 && <div className="text-center py-10 text-sm text-[#94A3B8]">{tab === "prioridad" ? "Nada urgente por ahora. Revisa Nuevos o Seguimientos." : "No hay registros aquí."}</div>}
          {filtrada.length > ver && <button onClick={() => setVer(ver + 40)} className="w-full py-3 rounded-xl text-sm font-bold border border-[#E2E8F0] bg-white">Ver más ({filtrada.length - ver})</button>}
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
        <Modal title={`Agendar visita · ${citaDe.it.nombre}`} onClose={() => setCitaDe(null)}>
          <AppointmentForm client={{ ...citaDe.it.raw, nombre: citaDe.it.nombre, telefono: citaDe.it.telefono, direccion: citaDe.it.direccion, ciudad: citaDe.it.ciudad, cp: citaDe.it.cp }}
            forceTipo="cita" agenteActivo={user.nombre} onSave={guardarCita} onClose={() => setCitaDe(null)} />
        </Modal>
      )}
      {entrevistaDe && <EntrevistaModal prospecto={entrevistaDe.it.raw} agente={user.nombre} onSave={guardarEntrevista} onClose={() => setEntrevistaDe(null)} />}
    </div>
  );
}
