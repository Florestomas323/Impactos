// ═══ CENTRO DE MANDO — ImpactOS v2 ════════════════════════════════════════
// Distinto según el rol real del usuario. Cada número es un botón que lleva
// a la pantalla correspondiente, ya filtrada cuando la pantalla lo permite.
// Los cálculos viven en src/services/commandCenter.ts (probados).
import { useMemo, useState } from "react";
import { Ico } from "../../iconos";
import { staffResumen, embudoComercial, ventasResumen, cobranzaResumen, reclutamientoResumen, Periodo, DESTINOS, accesible, destinoEmbudo } from "../../services/commandCenter";

export type Intent = Record<string, any>;
type Props = {
  user: { uid: string; role: string; nombre: string };
  state: any;
  appts: any[];
  callLog: any;
  irA: (tab: string, intent?: Intent) => void;
  contarVentasDemos: (o: any) => any;
  canTab: (tab: string) => boolean;     // permisos reales: un botón sin acceso NO se muestra
};
// Navegación por clave: el destino sale de DESTINOS (commandCenter.ts).
type Nav = { ok: (k: string) => boolean; go: (k: string) => () => void };
const navDe = (p: Props): Nav => ({
  ok: (k) => accesible(k, p.canTab),
  go: (k) => () => p.irA(DESTINOS[k].tab, DESTINOS[k].intent),
});

const STAFF = ["super_admin", "distribuidor", "supervisor"];
const dinero = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");

// ── Piezas visuales ─────────────────────────────────────────────────────────
function Tarjeta({ icon, label, n, hint, onClick, destacada = false }: { icon: string; label: string; n?: number | string; hint: string; onClick: () => void; destacada?: boolean }) {
  return (
    <button onClick={onClick}
      className={`text-left rounded-2xl p-4 min-h-[118px] flex flex-col justify-between border transition active:scale-[0.98] ${destacada ? "text-white border-transparent shadow-md hover:brightness-110" : "bg-white border-[#E5E7EB] hover:border-[#C7D2FE] hover:shadow-sm"}`}
      style={destacada ? { background: "#2563EB" } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-bold uppercase tracking-wider ${destacada ? "text-white/85" : "text-[#667085]"}`}>{label}</span>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${destacada ? "bg-white/15" : "bg-[#F1F5F9] text-[#334155]"}`}><Ico e={icon} size={16} /></span>
      </div>
      {n !== undefined
        ? <div className={`text-3xl font-black tracking-tight ${destacada ? "text-white" : "text-[#111827]"}`}>{n}</div>
        : <div className="text-lg font-black text-white">+ Nuevo</div>}
      <div className={`text-[11px] font-semibold ${destacada ? "text-white/80" : "text-[#2563EB]"}`}>{hint} →</div>
    </button>
  );
}

function Accion({ icon, label, onClick, principal = false }: { icon: string; label: string; onClick: () => void; principal?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl text-sm font-bold transition active:scale-[0.98] ${principal ? "text-white shadow-sm hover:brightness-110" : "bg-white text-[#111827] border border-[#E5E7EB] hover:bg-[#F8FAFC]"}`}
      style={principal ? { background: "#2563EB" } : undefined}>
      <Ico e={icon} size={16} />{label}
    </button>
  );
}

// Flujo en pasos (DATOS → LLAMADAS → …). Cada paso es clicable.
function Flujo({ titulo, pasos, extra }: { titulo: string; pasos: Array<{ label: string; n: number | string; onClick?: () => void }>; extra?: any }) {
  return (
    <section className="bg-white rounded-2xl border border-[#E5E7EB] p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#667085]">{titulo}</div>
        {extra}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {pasos.map((p, i) => {
          const cont = (<>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">{i + 1} · {p.label}</div>
            <div className="text-xl font-black text-[#111827]">{p.n}</div>
            {i < pasos.length - 1 && <span className="hidden sm:block absolute -right-2 top-1/2 -translate-y-1/2 text-[#A07CFF] font-black z-10">›</span>}
          </>);
          const cls = "relative text-left rounded-xl bg-[#F8FAFC] border border-[#EEF1F5] px-3 py-3";
          return p.onClick
            ? <button key={p.label} onClick={p.onClick} className={cls + " hover:border-[#C4B5FD] transition"}>{cont}</button>
            : <div key={p.label} className={cls}>{cont}</div>;
        })}
      </div>
    </section>
  );
}

function Pendientes({ items }: { items: Array<{ icon: string; label: string; n: number; onClick: () => void; ok?: boolean }> }) {
  const con = items.filter((i) => i.ok !== false && i.n > 0);
  return (
    <section className="bg-white rounded-2xl border border-[#E5E7EB]">
      <div className="px-4 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider text-[#667085]">Para atender</div>
      {con.length === 0
        ? <div className="px-4 pb-4 text-sm text-[#667085]">Todo al día. Nada pendiente por ahora.</div>
        : <div className="divide-y divide-[#F3F4F6]">
            {con.map((i) => (
              <button key={i.label} onClick={i.onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F8FAFC] transition">
                <span className="w-8 h-8 rounded-xl bg-[#F1F5F9] text-[#334155] flex items-center justify-center shrink-0"><Ico e={i.icon} size={15} /></span>
                <span className="flex-1 text-sm font-semibold text-[#111827]">{i.label}</span>
                <span className="text-sm font-black text-[#111827]">{i.n}</span>
                <span className="text-[#94A3B8]">›</span>
              </button>
            ))}
          </div>}
    </section>
  );
}

// ── Vistas por rol ──────────────────────────────────────────────────────────
function VistaStaff(props: Props) {
  const { state, appts, contarVentasDemos } = props;
  const { ok, go } = navDe(props);
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const r = useMemo(() => staffResumen(state, appts), [state, appts]);
  const e = useMemo(() => embudoComercial(state, appts, periodo, contarVentasDemos), [state, appts, periodo]);
  const a = r.acciones;
  // Pasos del embudo: el destino transporta el periodo elegido (Hoy / Semana / Mes).
  const paso = (k: string, label: string, n: number | string) => ({
    label, n,
    onClick: ok(k) ? () => { const d = destinoEmbudo(k, periodo); props.irA(d.tab, { ...d.intent, metrica: `${label}: ${n}` }); } : undefined,
  });
  return (<>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ok("visitasHoy") && <Tarjeta icon="📅" label="Visitas del día" n={r.visitasHoy} hint="Ver en agenda" onClick={go("visitasHoy")} />}
      {ok("entrevistasHoy") && <Tarjeta icon="🧲" label="Entrevistas del día" n={r.entrevistasHoy} hint="Ver entrevistas" onClick={go("entrevistasHoy")} />}
      {ok("serviciosHoy") && <Tarjeta icon="🔧" label="Servicios del día" n={r.serviciosHoy} hint="Ver servicios" onClick={go("serviciosHoy")} />}
      {ok("agendar") && <Tarjeta icon="➕" label="Agendar" hint="Visita, entrevista, servicio…" destacada onClick={go("agendar")} />}
    </section>
    <Flujo titulo="Rendimiento comercial"
      extra={<div className="inline-flex rounded-lg border border-[#E2E8F0] p-0.5 bg-[#F8FAFC]">
        {([["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"]] as const).map(([id, t]) => (
          <button key={id} onClick={() => setPeriodo(id)} className={`px-3 py-1 rounded-md text-xs font-bold ${periodo === id ? "bg-white text-[#111827] shadow-sm" : "text-[#667085]"}`}>{t}</button>
        ))}
      </div>}
      pasos={[
        paso("fVisitas", "Visitas realizadas", e.visitas),
        paso("fDemos", "Demos", e.demos),
        paso("fVentas", "Ventas", e.ventas),
        paso("fVolumen", "Volumen", dinero(e.volumen)),
      ]} />
    <Pendientes items={[
      { icon: "📅", label: "Visitas de mañana", n: a.visitasManana, onClick: go("visitasManana"), ok: ok("visitasManana") },
      { icon: "⏰", label: "Seguimientos vencidos", n: a.seguimientosVencidos, onClick: go("seguimientosVencidos"), ok: ok("seguimientosVencidos") },
      { icon: "📥", label: "Datos frescos sin asignar", n: a.frescosSinAsignar, onClick: go("frescosSinAsignar"), ok: ok("frescosSinAsignar") },
      { icon: "🔧", label: "Servicios pendientes", n: a.serviciosPendientes, onClick: go("serviciosPendientes"), ok: ok("serviciosPendientes") },
      { icon: "🧲", label: "Entrevistas pendientes", n: a.entrevistasPendientes, onClick: go("entrevistasPendientes"), ok: ok("entrevistasPendientes") },
      { icon: "👥", label: `Carga del equipo · ${a.personasConDatos} personas con datos`, n: a.asignados, onClick: go("cargaEquipo"), ok: ok("cargaEquipo") },
    ]} />
  </>);
}

function VistaVentas(props: Props) {
  const { user, state, appts, callLog } = props;
  const { ok, go } = navDe(props);
  const r = useMemo(() => ventasResumen(state, appts, callLog, { uid: user.uid, nombre: user.nombre }), [state, appts, callLog, user.uid]);
  const paso = (k: string, label: string, n: number) => ({ label, n, onClick: ok(k) ? go(k) : undefined });
  return (<>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ok("vCartera") && <Tarjeta icon="🗂" label="Mi cartera" n={r.miCartera} hint="Ver mis datos" onClick={go("vCartera")} />}
      {ok("vPorLlamar") && <Tarjeta icon="📞" label="Por llamar" n={r.porLlamar} hint="Empezar a llamar" onClick={go("vPorLlamar")} />}
      {ok("vSeguimientos") && <Tarjeta icon="⏰" label="Seguimientos" n={r.seguimientos} hint="Ver seguimientos" onClick={go("vSeguimientos")} />}
      {ok("vCitasHoy") && <Tarjeta icon="📅" label="Citas de hoy" n={r.citasHoy} hint="Ver en agenda" onClick={go("vCitasHoy")} />}
    </section>
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {ok("vContinuar") && <Accion principal icon="📞" label="Continuar llamadas" onClick={go("vContinuar")} />}
      {ok("vAgendar") && <Accion icon="➕" label="Agendar visita" onClick={go("vAgendar")} />}
      {ok("vMisCitas") && <Accion icon="📅" label="Mis citas" onClick={go("vMisCitas")} />}
    </section>
    <Flujo titulo="Datos → llamadas → contacto → cita" pasos={[
      paso("vfDatos", "Datos", r.flujo.datos),
      paso("vfLlamadas", "Llamadas hoy", r.flujo.llamadasHoy),
      paso("vfContactados", "Contactados", r.flujo.contactados),
      paso("vfCitas", "Citas próximas", r.flujo.citas),
    ]} />
  </>);
}

function VistaCobranza(props: Props) {
  const { user, state, appts } = props;
  const { ok, go } = navDe(props);
  const r = useMemo(() => cobranzaResumen(state, appts, { uid: user.uid, nombre: user.nombre }), [state, appts, user.uid]);
  return (<>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ok("cCartera") && <Tarjeta icon="💵" label="Mi cartera" n={r.miCartera} hint="Abrir cobranza" onClick={go("cCartera")} />}
      {ok("cPendientes") && <Tarjeta icon="📋" label="Pendientes hoy" n={r.pendientes} hint="Sin gestión hoy" onClick={go("cPendientes")} />}
      {ok("cSeguimientos") && <Tarjeta icon="⏰" label="Seguimientos de hoy" n={r.seguimientosHoy} hint="Promesas y recordatorios" onClick={go("cSeguimientos")} />}
      {ok("cCompromisos") && <Tarjeta icon="🤝" label="Compromisos" n={r.compromisos} hint="Próximos" onClick={go("cCompromisos")} />}
    </section>
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {ok("cContinuar") && <Accion principal icon="💵" label="Continuar cobranza" onClick={go("cContinuar")} />}
      {ok("cLlamar") && <Accion icon="📞" label="Llamar clientes" onClick={go("cLlamar")} />}
      {ok("cAgendar") && <Accion icon="➕" label="Agendar seguimiento" onClick={go("cAgendar")} />}
    </section>
  </>);
}

function VistaReclutamiento(props: Props) {
  const { user, state, appts } = props;
  const { ok, go } = navDe(props);
  const r = useMemo(() => reclutamientoResumen(state, appts, { uid: user.uid, nombre: user.nombre }), [state, appts, user.uid]);
  const paso = (k: string, label: string, n: number) => ({ label, n, onClick: ok(k) ? go(k) : undefined });
  return (<>
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ok("rProspectos") && <Tarjeta icon="🧲" label="Mis prospectos" n={r.misProspectos} hint="Ver prospectos" onClick={go("rProspectos")} />}
      {ok("rPorContactar") && <Tarjeta icon="📞" label="Por contactar" n={r.porContactar} hint="Empezar" onClick={go("rPorContactar")} />}
      {ok("rEntrevistasHoy") && <Tarjeta icon="📅" label="Entrevistas de hoy" n={r.entrevistasHoy} hint="Ver entrevistas" onClick={go("rEntrevistasHoy")} />}
      {ok("rSeguimientos") && <Tarjeta icon="⏰" label="Seguimientos" n={r.seguimientos} hint="Ver prospectos" onClick={go("rSeguimientos")} />}
    </section>
    <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {ok("rContinuar") && <Accion principal icon="🧲" label="Continuar contactos" onClick={go("rContinuar")} />}
      {ok("rAgendar") && <Accion icon="➕" label="Agendar entrevista" onClick={go("rAgendar")} />}
      {ok("rVerEntrevistas") && <Accion icon="📅" label="Ver entrevistas" onClick={go("rVerEntrevistas")} />}
    </section>
    <Flujo titulo="Prospecto → contacto → entrevista → nuevo socio" pasos={[
      paso("rfProspectos", "Prospectos", r.flujo.prospectos),
      paso("rfContactados", "Contactados", r.flujo.contactados),
      paso("rfEntrevistados", "Entrevistados", r.flujo.entrevistados),
      paso("rfSocios", "Nuevos socios", r.flujo.socios),
    ]} />
  </>);
}

export function CommandCenterV2(props: Props) {
  const { user } = props;
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const sub = STAFF.includes(user.role) ? "Tu operación de hoy y lo que requiere atención."
    : user.role === "telemarketing_cobranza" ? "Tu cartera de cobranza de hoy."
    : user.role === "telemarketing_reclutamiento" ? "Tus prospectos de reclutamiento de hoy."
    : "Tus datos y llamadas de hoy.";
  return (
    <div className="space-y-4">
      <section>
        <div className="text-xs font-semibold text-slate-500">{saludo}, {user.nombre}</div>
        <h1 className="mt-1 text-2xl sm:text-[30px] font-black tracking-[-0.035em] text-slate-950">Centro de mando</h1>
        <p className="mt-1 text-sm text-slate-500">{sub}</p>
      </section>
      {STAFF.includes(user.role) ? <VistaStaff {...props} />
        : user.role === "telemarketing_cobranza" ? <VistaCobranza {...props} />
        : user.role === "telemarketing_reclutamiento" ? <VistaReclutamiento {...props} />
        : <VistaVentas {...props} />}
    </div>
  );
}
