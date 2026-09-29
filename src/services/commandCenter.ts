// ═══ CENTRO DE MANDO v2 — CÁLCULOS (puros, probados en tests/commandCenter.test.ts) ═
// Todo lo que el dashboard muestra sale de aquí. Reglas:
//  • Telemarketing: SOLO registros con assignedTo === su uid (nunca asignado_a por nombre).
//  • Cada número lleva a una pantalla (el componente se encarga de la navegación).
//  • Lectura segura de listas históricas (asList): no se modifica ningún dato.
import { asList, wasWorked, deriveWorkStatus } from "./assignments";
import { esCitaDe } from "./apptTrace";

// ── Resultados de cita ──────────────────────────────────────────────────────
// Visita REALIZADA = se fue físicamente al domicilio.
//   Cuentan: demo_venta, demo_no_venta, no_recibio, seguimiento
//   (+ "venta" / "no_venta": nombres viejos de demo_venta / demo_no_venta que
//    contarVentasDemos ya trata como demos; sin ellos Demos podría superar a Visitas).
//   NO cuentan: no_visito, reset, recompra, sin resultado, o cualquier otro.
// Demo = demo_venta, demo_no_venta (y sus nombres viejos).
export const RESULTADOS_VISITA = ["demo_venta", "demo_no_venta", "no_recibio", "seguimiento", "venta", "no_venta"];
export const RESULTADOS_DEMO = ["demo_venta", "demo_no_venta", "venta", "no_venta"];
export const esVisitaRealizada = (resultado: any) => RESULTADOS_VISITA.includes(String(resultado || ""));

export type Periodo = "hoy" | "semana" | "mes";
type Ctx = { uid: string; nombre: string; now?: Date };

const p2 = (n: number) => String(n).padStart(2, "0");
export const diaLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// Citas: la fecha ya viene en hora local ("2026-09-24T15:00"), igual que usa Agenda.
const diaAppt = (a: any) => String(a?.fecha || "").slice(0, 10);
// Historial: puede venir en ISO UTC; se pasa al día local.
const diaHist = (f: any) => { if (!f) return ""; const d = new Date(f); return isNaN(d.getTime()) ? String(f).slice(0, 10) : diaLocal(d); };
const tipoAppt = (a: any) => a?.tipo || a?._type || "";
const vivos = (arr: any) => asList(arr).filter((r: any) => r && !r.eliminado);

export function rango(periodo: Periodo, now = new Date()) {
  const hoy = diaLocal(now);
  if (periodo === "hoy") return { desde: hoy, hasta: hoy };
  if (periodo === "semana") { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { desde: diaLocal(d), hasta: hoy }; } // lunes
  return { desde: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-01`, hasta: hoy };
}
const dentro = (dia: string, r: { desde: string; hasta: string }) => !!dia && dia >= r.desde && dia <= r.hasta;

// ── Staff: Distribuidor / Supervisor / Súper Admin ──────────────────────────
export function staffResumen(state: any, appts: any[], now = new Date()) {
  const hoy = diaLocal(now);
  const manana = diaLocal(new Date(now.getTime() + 86400000));
  const A = vivos(appts);
  const deHoy = (t: string) => A.filter((a: any) => tipoAppt(a) === t && diaAppt(a) === hoy);
  // Entrevistas: misma fuente que muestra Reclutamiento → Entrevistas.
  const entrevistas = vivos(state?.reclutamiento).filter((r: any) => r.entrevista_agendada);
  const diaEnt = (r: any) => String(r.entrevista_agendada || "").slice(0, 10);
  const registros = [
    ...vivos(state?.agregados), ...vivos(state?.prospectos), ...vivos(state?.distribucion),
    ...vivos(state?.referidos), ...vivos(state?.reclutamiento),
    ...Object.values(state?.cobranza?.clientesData || {}).filter((r: any) => r && !r.eliminado),
  ];
  const comerciales = [...vivos(state?.agregados), ...vivos(state?.prospectos), ...vivos(state?.distribucion), ...vivos(state?.referidos)];
  const asignados = registros.filter((r: any) => r.assignedTo);
  return {
    visitasHoy: deHoy("cita").length,
    entrevistasHoy: entrevistas.filter((r: any) => diaEnt(r) === hoy).length,
    serviciosHoy: deHoy("servicio").length,
    acciones: {
      visitasManana: A.filter((a: any) => tipoAppt(a) === "cita" && diaAppt(a) === manana).length,
      seguimientosVencidos: comerciales.filter((c: any) => c.proximo_seguimiento && c.proximo_seguimiento < hoy).length,
      frescosSinAsignar: registros.filter((r: any) => !r.assignedTo && deriveWorkStatus(r) === "fresh").length,
      serviciosPendientes: A.filter((a: any) => tipoAppt(a) === "servicio" && !["realizado", "no_realizado"].includes(a.servicioResultado || "")).length,
      entrevistasPendientes: entrevistas.filter((r: any) => diaEnt(r) >= hoy && !r.entrevistado).length,
      asignados: asignados.length,
      personasConDatos: new Set(asignados.map((r: any) => r.assignedTo)).size,
    },
  };
}

// VISITAS REALIZADAS → DEMOS → VENTAS → VOLUMEN (reutiliza contarVentasDemos de la app)
export function embudoComercial(state: any, appts: any[], periodo: Periodo, contarVentasDemos: (o: any) => any, now = new Date()) {
  const r = rango(periodo, now);
  const clientes = [
    ...vivos(state?.agregados), ...vivos(state?.prospectos), ...vivos(state?.distribucion),
    ...vivos(state?.referidos), ...vivos(state?.referidos).flatMap((x: any) => asList(x.referidos)),
  ];
  // Visita realizada = cita con resultado que no sea "no se visitó" (misma regla de exclusión
  // de citas ya sincronizadas que usa contarVentasDemos, para no contar dos veces).
  let visitas = 0;
  vivos(appts).forEach((a: any) => {
    if (a._sincronizado || tipoAppt(a) !== "cita" || !dentro(diaAppt(a), r)) return;
    if (esVisitaRealizada(a.resultado)) visitas++;
  });
  clientes.forEach((c: any) => asList(c.historial).forEach((h: any) => {
    if (h && esVisitaRealizada(h.cita_resultado) && dentro(diaHist(h.fecha), r)) visitas++;
  }));
  const { demos, ventas, volumen } = contarVentasDemos({ appts: vivos(appts), clientes, enP: (f: any) => dentro(diaHist(f), r) });
  return { visitas, demos, ventas, volumen };
}

// ── Telemarketing ───────────────────────────────────────────────────────────
const mios = (arr: any, uid: string) => vivos(arr).filter((r: any) => r.assignedTo === uid);
const misAppts = (appts: any[], c: Ctx) => vivos(appts).filter((a: any) => esCitaDe(a, c.uid));

export function ventasResumen(state: any, appts: any[], callLog: any, c: Ctx) {
  const now = c.now || new Date(); const hoy = diaLocal(now);
  const cartera = [...mios(state?.agregados, c.uid), ...mios(state?.prospectos, c.uid), ...mios(state?.referidos, c.uid), ...mios(state?.distribucion, c.uid)];
  const citas = misAppts(appts, c).filter((a: any) => tipoAppt(a) === "cita");
  return {
    miCartera: cartera.length,
    // Sin campo estado = "sin_estado" (dato fresco), igual que la bandeja de Llamadas.
    porLlamar: cartera.filter((r: any) => ["sin_estado", "naranja"].includes(r.estado || "sin_estado")).length,
    seguimientos: cartera.filter((r: any) => r.proximo_seguimiento && r.proximo_seguimiento <= hoy).length,
    citasHoy: citas.filter((a: any) => diaAppt(a) === hoy).length,
    // DATOS → LLAMADAS → CONTACTO → CITA
    flujo: {
      datos: cartera.length,
      llamadasHoy: Number(callLog?.[hoy]?.[c.nombre] || 0),
      contactados: cartera.filter((r: any) => wasWorked(r)).length,
      citas: citas.filter((a: any) => diaAppt(a) >= hoy).length,
    },
  };
}

export function cobranzaResumen(state: any, appts: any[], c: Ctx) {
  const now = c.now || new Date(); const hoy = diaLocal(now);
  const cuentas = Object.entries(state?.cobranza?.clientesData || {})
    .map(([id, v]: any) => ({ ...v, id })).filter((r: any) => !r.eliminado && r.assignedTo === c.uid);
  // ¿Se gestionó hoy? Las llamadas de Cobranza viven en `gestiones` (CallCenterV2).
  // `historial` es de pagos/promesas: un pago o una promesa NO es una llamada.
  // Compatibilidad: solo entradas de historial identificables como llamada/gestión.
  const GESTION = ["gestion", "llamada", "seguimiento_completado"];
  const gestionHoy = (r: any) =>
    asList(r.gestiones).some((g: any) => g && GESTION.includes(g.tipo) && diaHist(g.fecha) === hoy)
    || asList(r.historial).some((h: any) => h && (h.tipo === "llamada" || h.tipo === "gestion") && diaHist(h.fecha) === hoy);
  const promesa = (r: any) => String(r?.promesa?.fecha || "").slice(0, 10);
  const seguimiento = (r: any) => String(r?.proximo_seguimiento || "").slice(0, 10);
  // Seguimientos de hoy: cuentas ÚNICAS con seguimiento o promesa hoy.
  const hoyIds = new Set(cuentas.filter((r: any) => seguimiento(r) === hoy || promesa(r) === hoy).map((r: any) => String(r.id)));
  // Recordatorios de Agenda de hoy: suman solo si son OTRO evento (no de una cuenta ya contada).
  let extras = 0;
  misAppts(appts, c).filter((a: any) => ["llamada", "recordatorio"].includes(tipoAppt(a)) && diaAppt(a) === hoy).forEach((a: any) => {
    if (a.sourceSection === "cobranza" && a.sourceRecordId) {
      const id = String(a.sourceRecordId);
      if (cuentas.some((r: any) => String(r.id) === id)) { hoyIds.add(id); return; }   // misma cuenta: una sola vez
    }
    extras++;
  });
  return {
    miCartera: cuentas.length,
    pendientes: cuentas.filter((r: any) => !gestionHoy(r)).length,                  // sin gestión hoy
    seguimientosHoy: hoyIds.size + extras,
    // Compromisos = promesas de pago reales y vigentes (no recordatorios de Agenda).
    compromisos: cuentas.filter((r: any) => promesa(r) && promesa(r) >= hoy).length,
  };
}

export function reclutamientoResumen(state: any, appts: any[], c: Ctx) {
  const now = c.now || new Date(); const hoy = diaLocal(now);
  const P = mios(state?.reclutamiento, c.uid);
  const entrevistasHoy = P.filter((r: any) => String(r.entrevista_agendada || "").slice(0, 10) === hoy).length;
  const contactado = (r: any) => wasWorked(r) || (r.resultado && r.resultado !== "Pendiente") || !!r.entrevista_agendada || !!r.entrevistado;
  return {
    misProspectos: P.length,
    porContactar: P.filter((r: any) => !contactado(r)).length,
    entrevistasHoy,
    seguimientos: P.filter((r: any) => (r.proximo_seguimiento && r.proximo_seguimiento <= hoy) || r.resultado === "2da entrevista").length,
    // PROSPECTO → CONTACTO → ENTREVISTA → NUEVO SOCIO
    flujo: {
      prospectos: P.length,
      contactados: P.filter(contactado).length,
      entrevistados: P.filter((r: any) => !!r.entrevistado).length,
      socios: P.filter((r: any) => r.resultado === "Nuevo socio").length,
    },
  };
}

// Tipos de agenda que cada rol puede crear (sobre los que ya existen en Agenda).
export const TIPOS_AGENDA_POR_ROL: Record<string, string[] | null> = {
  super_admin: null, distribuidor: null, supervisor: null,          // null = todos
  telemarketing_ventas: ["cita", "llamada"],
  telemarketing_cobranza: ["llamada"],
  telemarketing_reclutamiento: ["entrevista", "llamada"],
};
export const AGENDAR_DIRECTO: Record<string, string> = {
  telemarketing_ventas: "cita", telemarketing_cobranza: "llamada", telemarketing_reclutamiento: "entrevista",
};

// ── DESTINOS: a dónde lleva cada botón del Centro de mando ─────────────────
// Declarados como datos para poder PROBAR que ningún botón visible lleva a una
// pestaña que el rol no puede abrir (el componente oculta lo que canTab niega).
export type Destino = { tab: string; intent?: Record<string, any> };
export const DESTINOS: Record<string, Destino> = {
  // Staff
  visitasHoy: { tab: "agenda", intent: { filtro: "hoy", filtroTipo: "cita" } },
  entrevistasHoy: { tab: "reclutamiento", intent: { tab: "entrevistas", soloHoy: true } },
  serviciosHoy: { tab: "servicio", intent: { filtro: "hoy" } },
  agendar: { tab: "agenda", intent: { abrirMenu: true } },
  fVisitas: { tab: "agenda", intent: { filtro: "todas", filtroTipo: "cita" } },
  fDemos: { tab: "stats" },
  fVentas: { tab: "agenda", intent: { filtro: "todas", filtroResultado: "demo_venta" } },
  fVolumen: { tab: "stats" },
  visitasManana: { tab: "agenda", intent: { filtro: "proximas", filtroTipo: "cita" } },
  seguimientosVencidos: { tab: "llamadas" },
  frescosSinAsignar: { tab: "asignaciones" },
  serviciosPendientes: { tab: "servicio", intent: { filtro: "pendiente" } },
  entrevistasPendientes: { tab: "reclutamiento", intent: { tab: "entrevistas" } },
  cargaEquipo: { tab: "asignaciones" },
  // Telemarketing Ventas
  vCartera: { tab: "llamadas" }, vPorLlamar: { tab: "llamadas" }, vSeguimientos: { tab: "llamadas" },
  vCitasHoy: { tab: "agenda", intent: { filtro: "hoy", filtroTipo: "cita" } },
  vContinuar: { tab: "llamadas" },
  vAgendar: { tab: "agenda", intent: { abrirTipo: "cita" } },
  vMisCitas: { tab: "agenda", intent: { filtro: "todas", filtroTipo: "cita" } },
  vfDatos: { tab: "llamadas" }, vfLlamadas: { tab: "llamadas" }, vfContactados: { tab: "llamadas" },
  vfCitas: { tab: "agenda", intent: { filtro: "todas", filtroTipo: "cita" } },
  // Telemarketing Cobranza
  cCartera: { tab: "cobranza" }, cPendientes: { tab: "cobranza" }, cSeguimientos: { tab: "cobranza" },
  cCompromisos: { tab: "cobranza" },   // las promesas viven en Cobranza (aún sin filtro directo)
  cContinuar: { tab: "cobranza" },
  cLlamar: { tab: "llamadas" },   // su bandeja de Cobranza
  cAgendar: { tab: "agenda", intent: { abrirTipo: "llamada" } },
  // Telemarketing Reclutamiento
  rProspectos: { tab: "reclutamiento" }, rPorContactar: { tab: "reclutamiento" }, rSeguimientos: { tab: "reclutamiento" },
  rEntrevistasHoy: { tab: "reclutamiento", intent: { tab: "entrevistas", soloHoy: true } },
  rContinuar: { tab: "reclutamiento" },
  rAgendar: { tab: "agenda", intent: { abrirTipo: "entrevista" } },
  rVerEntrevistas: { tab: "reclutamiento", intent: { tab: "entrevistas" } },
  rfProspectos: { tab: "reclutamiento" }, rfContactados: { tab: "reclutamiento" }, rfEntrevistados: { tab: "reclutamiento" }, rfSocios: { tab: "reclutamiento" },
};
// Qué botones puede llegar a mostrar cada vista (antes de filtrar por permisos).
const STAFF_KEYS = ["visitasHoy", "entrevistasHoy", "serviciosHoy", "agendar", "fVisitas", "fDemos", "fVentas", "fVolumen",
  "visitasManana", "seguimientosVencidos", "frescosSinAsignar", "serviciosPendientes", "entrevistasPendientes", "cargaEquipo"];
export const KEYS_POR_ROL: Record<string, string[]> = {
  super_admin: STAFF_KEYS, distribuidor: STAFF_KEYS, supervisor: STAFF_KEYS,
  telemarketing_ventas: ["vCartera", "vPorLlamar", "vSeguimientos", "vCitasHoy", "vContinuar", "vAgendar", "vMisCitas", "vfDatos", "vfLlamadas", "vfContactados", "vfCitas"],
  telemarketing_cobranza: ["cCartera", "cPendientes", "cSeguimientos", "cCompromisos", "cContinuar", "cLlamar", "cAgendar"],
  telemarketing_reclutamiento: ["rProspectos", "rPorContactar", "rEntrevistasHoy", "rSeguimientos", "rContinuar", "rAgendar", "rVerEntrevistas", "rfProspectos", "rfContactados", "rfEntrevistados", "rfSocios"],
};
// Un botón se muestra SOLO si su pestaña destino está permitida para quien mira.
export const accesible = (key: string, canTab: (tab: string) => boolean) => !!DESTINOS[key] && canTab(DESTINOS[key].tab);

// ── Embudo: el destino lleva el PERIODO que se estaba mirando ───────────────
// Agenda solo filtra "Hoy" y Estadísticas solo muestra un mes. Donde la pantalla
// soporta el periodo, entra filtrada; donde no, abre la sección y muestra el
// periodo medido en un aviso (intent.periodo + intent.rango). No se inventan filtros.
export const PERIODO_LABEL: Record<Periodo, string> = { hoy: "Hoy", semana: "Esta semana", mes: "Este mes" };
export function destinoEmbudo(key: string, periodo: Periodo, now = new Date()): Destino {
  const base = DESTINOS[key];
  if (!base) return base;
  const extra = { periodo, rango: rango(periodo, now) };
  if (base.tab === "agenda") {
    // Agenda sabe filtrar "hoy"; semana/mes → todas + aviso de periodo.
    return { tab: "agenda", intent: { ...base.intent, filtro: periodo === "hoy" ? "hoy" : "todas", ...extra } };
  }
  if (base.tab === "stats") {
    // Estadísticas muestra el mes actual por defecto: "mes" coincide; hoy/semana → aviso.
    return { tab: "stats", intent: { ...(base.intent || {}), ...extra } };
  }
  return { tab: base.tab, intent: { ...(base.intent || {}), ...extra } };
}
// ¿La pantalla destino ya muestra exactamente ese periodo? (si no, se muestra el aviso)
export function periodoSoportado(tab: string, periodo: Periodo) {
  return (tab === "agenda" && periodo === "hoy") || (tab === "stats" && periodo === "mes");
}
