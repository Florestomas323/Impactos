import { test } from "node:test";
import assert from "node:assert/strict";
import { staffResumen, embudoComercial, ventasResumen, cobranzaResumen, reclutamientoResumen, rango, diaLocal, TIPOS_AGENDA_POR_ROL, AGENDAR_DIRECTO, esVisitaRealizada, DESTINOS, KEYS_POR_ROL, accesible } from "../src/services/commandCenter";
import { canViewTab, TAB_PERMISSIONS } from "../src/auth/permissions";

const NOW = new Date(2026, 8, 24, 11, 0, 0);            // jueves 24/09/2026, hora local
const HOY = "2026-09-24", MANANA = "2026-09-25", AYER = "2026-09-23";
const at = (dia: string, h = "10:00") => `${dia}T${h}`;
// Copia mínima de la regla real de contarVentasDemos de App.tsx
const cvd = ({ appts = [], clientes = [], enP = () => true }: any) => {
  let demos = 0, ventas = 0, volumen = 0;
  appts.forEach((a: any) => { if (a._sincronizado || !enP(a.fecha)) return;
    if (a.resultado === "demo_venta") { ventas++; demos++; volumen += Number(a.monto) || 0; } else if (a.resultado === "demo_no_venta") demos++; });
  clientes.forEach((c: any) => (Array.isArray(c.historial) ? c.historial : Object.values(c.historial || {})).forEach((h: any) => {
    if (!enP(h.fecha)) return; if (h.cita_resultado === "demo_venta") { ventas++; demos++; volumen += Number(h.monto) || 0; } else if (h.cita_resultado === "demo_no_venta") demos++; }));
  return { demos, ventas, volumen };
};

const appts = [
  { id: 1, tipo: "cita", fecha: at(HOY), resultado: "demo_venta", monto: 3000 },
  { id: 2, tipo: "cita", fecha: at(HOY, "15:00") },
  { id: 3, tipo: "cita", fecha: at(MANANA) },                       // por confirmar
  { id: 4, tipo: "entrevista", fecha: at(HOY), createdByUid: "rec" },
  { id: 5, tipo: "entrevista", fecha: at(MANANA), createdByUid: "rec" },
  { id: 6, tipo: "servicio", fecha: at(HOY) },
  { id: 7, tipo: "servicio", fecha: at(AYER), servicioResultado: "realizado" },
  { id: 8, tipo: "cita", fecha: at(AYER), resultado: "no_visito" },
  { id: 9, tipo: "cita", fecha: at(HOY), eliminado: true },          // borrada: no cuenta
  { id: 10, tipo: "cita", fecha: at(HOY), assignedTo: "ven", createdByUid: "ven" },
  { id: 11, tipo: "llamada", fecha: at(HOY), createdByUid: "cob" },
  { id: 12, tipo: "llamada", fecha: at(MANANA), createdByUid: "cob" },
];
const state = {
  agregados: [
    { id: "a1", estado: "sin_estado", assignedTo: "ven", historial: [] },
    { id: "a2", estado: "naranja", assignedTo: "ven", proximo_seguimiento: AYER, historial: [{ tipo: "llamada", fecha: "2026-09-20T10:00:00" }] },
    { id: "a3", estado: "verde", assignedTo: "ven", asignado_a: "OtraPersona", historial: { k: { tipo: "llamada", fecha: "2026-09-21T10:00:00" } } },
    { id: "a4", estado: "sin_estado", assignedTo: null, asignado_a: "Vendedora", historial: [] },  // nombre viejo: NO es de ella
    { id: "a5", estado: "sin_estado", assignedTo: "otra", historial: [] },
  ],
  prospectos: [{ id: "p1", estado: "sin_estado", assignedTo: "ven", notas: "texto viejo" }],
  distribucion: [{ id: "d1", assignedTo: "cob", historial: [{ tipo: "cita", fecha: `${HOY}T09:00:00`, cita_resultado: "demo_no_venta" }] }],
  referidos: [{ id: "r1", assignedTo: "ven", referidos: { x: { nombre: "Luis" } } }],
  reclutamiento: [
    { id: "rc1", assignedTo: "rec", resultado: "Pendiente", entrevista_agendada: `${HOY}T16:00` },
    { id: "rc2", assignedTo: "rec", resultado: "2da entrevista", entrevistado: true, entrevista_agendada: `${AYER}T10:00` },
    { id: "rc5", assignedTo: "otro", resultado: "Pendiente", entrevista_agendada: `${MANANA}T10:00` },
    { id: "rc3", assignedTo: "rec", resultado: "Nuevo socio", entrevistado: true },
    { id: "rc4", assignedTo: "otro", resultado: "Pendiente" },
  ],
  cobranza: { clientesData: {
    d1: { assignedTo: "cob", historial: [{ tipo: "pago", fecha: `${HOY}T08:00:00` }], promesa: { fecha: HOY } },
    d2: { assignedTo: "cob", historial: [], promesa: { fecha: "2026-09-30" } },
    d3: { assignedTo: "otra" },
  } },
};

test("Rangos Hoy / Semana (lunes) / Mes en hora local", () => {
  assert.deepEqual(rango("hoy", NOW), { desde: HOY, hasta: HOY });
  assert.deepEqual(rango("semana", NOW), { desde: "2026-09-21", hasta: HOY });
  assert.deepEqual(rango("mes", NOW), { desde: "2026-09-01", hasta: HOY });
  assert.equal(diaLocal(NOW), HOY);
});

test("Staff: visitas, entrevistas y servicios del día + pendientes accionables", () => {
  const r = staffResumen(state, appts, NOW);
  assert.equal(r.visitasHoy, 3);                 // 1, 2 y 10 (la 9 está borrada)
  assert.equal(r.entrevistasHoy, 1);             // rc1: misma fuente que Reclutamiento → Entrevistas
  assert.equal(r.serviciosHoy, 1);
  assert.equal(r.acciones.visitasManana, 1);
  assert.equal(r.acciones.seguimientosVencidos, 1);
  assert.equal(r.acciones.frescosSinAsignar, 1);  // a4
  assert.equal(r.acciones.serviciosPendientes, 1);
  assert.equal(r.acciones.entrevistasPendientes, 2);   // rc1 (hoy) y rc5 (mañana); rc2 ya fue ayer
  assert.equal(r.acciones.personasConDatos, 5);   // ven, otra, cob, rec, otro: personas distintas
});

test("Embudo comercial Hoy / Semana / Mes reutiliza contarVentasDemos", () => {
  const hoy = embudoComercial(state, appts, "hoy", cvd, NOW);
  assert.deepEqual(hoy, { visitas: 2, demos: 2, ventas: 1, volumen: 3000 }); // cita 1 + historial d1
  const semana = embudoComercial(state, appts, "semana", cvd, NOW);
  assert.equal(semana.visitas, 2);                // la de ayer fue "no_visito": no cuenta
  assert.equal(semana.ventas, 1);
});

test("Telemarketing Ventas: SOLO assignedTo === su uid (nunca asignado_a)", () => {
  const r = ventasResumen(state, appts, { [HOY]: { Vendedora: 14 } }, { uid: "ven", nombre: "Vendedora", now: NOW });
  assert.equal(r.miCartera, 5);                  // a1 a2 a3 p1 r1 — NO a4 (asignado_a viejo) ni a5
  assert.equal(r.porLlamar, 3);                  // a1, a2 (naranja), p1
  assert.equal(r.seguimientos, 1);
  assert.equal(r.citasHoy, 1);                   // solo la suya (10)
  assert.equal(r.flujo.llamadasHoy, 14);
  assert.equal(r.flujo.contactados, 2);          // a2 y a3 (historial como mapa)
});

test("Telemarketing Cobranza: su cartera, pendientes, promesas y recordatorios", () => {
  const r = cobranzaResumen(state, appts, { uid: "cob", nombre: "Cob", now: NOW });
  assert.equal(r.miCartera, 2);
  assert.equal(r.pendientes, 1);                 // d2: sin gestión hoy
  assert.equal(r.seguimientosHoy, 2);            // promesa de d1 hoy + recordatorio 11
  assert.equal(r.compromisos, 3);                // promesas d1, d2 + recordatorio 12
  assert.equal(r.clientesDistribucion, 1);
});

test("Telemarketing Reclutamiento: prospecto → contacto → entrevista → socio", () => {
  const r = reclutamientoResumen(state, appts, { uid: "rec", nombre: "Rec", now: NOW });
  assert.equal(r.misProspectos, 3);
  assert.equal(r.porContactar, 0);               // rc1 ya tiene entrevista agendada
  assert.equal(r.entrevistasHoy, 1);
  assert.equal(r.seguimientos, 1);               // 2da entrevista
  assert.deepEqual(r.flujo, { prospectos: 3, contactados: 3, entrevistados: 2, socios: 1 });
});

test("Agendar según rol: staff ve todo; cada telemarketing solo lo suyo", () => {
  assert.equal(TIPOS_AGENDA_POR_ROL.distribuidor, null);
  assert.equal(TIPOS_AGENDA_POR_ROL.supervisor, null);
  assert.deepEqual(TIPOS_AGENDA_POR_ROL.telemarketing_ventas, ["cita", "llamada"]);
  assert.deepEqual(TIPOS_AGENDA_POR_ROL.telemarketing_cobranza, ["llamada"]);
  assert.deepEqual(TIPOS_AGENDA_POR_ROL.telemarketing_reclutamiento, ["entrevista", "llamada"]);
  assert.deepEqual(AGENDAR_DIRECTO, { telemarketing_ventas: "cita", telemarketing_cobranza: "llamada", telemarketing_reclutamiento: "entrevista" });
});

// ── Punto 2: "Visitas de mañana" no depende de resultado ─────────────────────
test("Visitas de mañana: cuenta citas de mañana, con o sin resultado", () => {
  const ap = [
    { id: "m1", tipo: "cita", fecha: at(MANANA) },
    { id: "m2", tipo: "cita", fecha: at(MANANA, "18:00"), resultado: "seguimiento" },
    { id: "m3", tipo: "servicio", fecha: at(MANANA) },
    { id: "m4", tipo: "cita", fecha: at(HOY) },
  ];
  assert.equal(staffResumen({}, ap, NOW).acciones.visitasManana, 2);
});

// ── Punto 3: cada resultado, por separado ────────────────────────────────────
const unaCita = (resultado: any) => embudoComercial({}, [{ id: 1, tipo: "cita", fecha: at(HOY), resultado, monto: resultado === "demo_venta" ? 1000 : 0 }], "hoy", cvd, NOW);
test("reset NO cuenta como visita realizada", () => assert.deepEqual(unaCita("reset"), { visitas: 0, demos: 0, ventas: 0, volumen: 0 }));
test("recompra NO cuenta como visita realizada", () => assert.deepEqual(unaCita("recompra"), { visitas: 0, demos: 0, ventas: 0, volumen: 0 }));
test("no_visito NO cuenta", () => assert.deepEqual(unaCita("no_visito"), { visitas: 0, demos: 0, ventas: 0, volumen: 0 }));
test("sin resultado NO cuenta", () => assert.deepEqual(unaCita(undefined), { visitas: 0, demos: 0, ventas: 0, volumen: 0 }));
test("no_recibio SÍ es visita realizada pero NO demo", () => assert.deepEqual(unaCita("no_recibio"), { visitas: 1, demos: 0, ventas: 0, volumen: 0 }));
test("seguimiento SÍ es visita realizada pero NO demo", () => assert.deepEqual(unaCita("seguimiento"), { visitas: 1, demos: 0, ventas: 0, volumen: 0 }));
test("demo_no_venta = visita + demo", () => assert.deepEqual(unaCita("demo_no_venta"), { visitas: 1, demos: 1, ventas: 0, volumen: 0 }));
test("demo_venta = visita + demo + venta", () => assert.deepEqual(unaCita("demo_venta"), { visitas: 1, demos: 1, ventas: 1, volumen: 1000 }));
test("La regla también aplica al historial del cliente, y siempre Visitas ≥ Demos ≥ Ventas", () => {
  ["demo_venta", "demo_no_venta", "no_recibio", "seguimiento", "venta", "no_venta"].forEach((x) => assert.ok(esVisitaRealizada(x), x));
  ["no_visito", "reset", "recompra", "", undefined, "cualquier_otro"].forEach((x) => assert.ok(!esVisitaRealizada(x), String(x)));
  const st = { agregados: [{ id: "h", historial: ["demo_venta", "demo_no_venta", "no_recibio", "reset", "recompra", "no_visito"].map((r) => ({ tipo: "cita", fecha: `${HOY}T12:00:00`, cita_resultado: r })) }] };
  const e = embudoComercial(st, [], "hoy", cvd, NOW);
  assert.deepEqual({ v: e.visitas, d: e.demos, s: e.ventas }, { v: 3, d: 2, s: 1 });
  assert.ok(e.visitas >= e.demos && e.demos >= e.ventas);
});

// ── Punto 4: Entrevistas llevan a Reclutamiento → Entrevistas ────────────────
test("Entrevistas del día / de hoy / Ver entrevistas van a Reclutamiento → Entrevistas", () => {
  assert.deepEqual(DESTINOS.entrevistasHoy, { tab: "reclutamiento", intent: { tab: "entrevistas", soloHoy: true } });
  assert.deepEqual(DESTINOS.rEntrevistasHoy, { tab: "reclutamiento", intent: { tab: "entrevistas", soloHoy: true } });
  assert.deepEqual(DESTINOS.rVerEntrevistas, { tab: "reclutamiento", intent: { tab: "entrevistas" } });
  assert.deepEqual(DESTINOS.rAgendar, { tab: "agenda", intent: { abrirTipo: "entrevista" } });
});

// ── Punto 5: ningún botón lleva a una pestaña que canTab prohíbe ─────────────
const U = (role: string) => ({ uid: "u", role, status: "active", appId: "impactos" });
test("Todo destino existe como pestaña con permisos definidos", () => {
  Object.entries(DESTINOS).forEach(([k, d]) => assert.ok(TAB_PERMISSIONS[d.tab], `${k} → ${d.tab}`));
  Object.values(KEYS_POR_ROL).flat().forEach((k) => assert.ok(DESTINOS[k], k));
});
test("Ningún rol recibe acceso por un botón del dashboard a una pestaña que canTab le prohíbe", () => {
  for (const role of Object.keys(KEYS_POR_ROL)) {
    const canTab = (t: string) => canViewTab(U(role), t);
    const visibles = KEYS_POR_ROL[role].filter((k) => accesible(k, canTab));
    visibles.forEach((k) => assert.ok(canViewTab(U(role), DESTINOS[k].tab), `${role} vería ${k} → ${DESTINOS[k].tab}`));
    assert.ok(visibles.length > 0, role);
  }
});
test("Supervisor: sin Servicios ni Reclutamiento en su dashboard (sus permisos actuales)", () => {
  const canTab = (t: string) => canViewTab(U("supervisor"), t);
  const vis = KEYS_POR_ROL.supervisor.filter((k) => accesible(k, canTab));
  ["serviciosHoy", "serviciosPendientes", "entrevistasHoy", "entrevistasPendientes"].forEach((k) => assert.ok(!vis.includes(k), k));
  ["visitasHoy", "agendar", "fVisitas", "fDemos", "fVentas", "fVolumen", "visitasManana", "seguimientosVencidos", "frescosSinAsignar", "cargaEquipo"].forEach((k) => assert.ok(vis.includes(k), k));
  // Distribuidor y Súper Admin sí ven las 4 tarjetas
  for (const role of ["distribuidor", "super_admin"]) {
    const ct = (t: string) => canViewTab(U(role), t);
    ["visitasHoy", "entrevistasHoy", "serviciosHoy", "agendar"].forEach((k) => assert.ok(accesible(k, ct), `${role} ${k}`));
  }
});

// ── r3: el embudo transporta el periodo ──────────────────────────────────────
import { destinoEmbudo, periodoSoportado } from "../src/services/commandCenter";
test("Embudo Hoy: Agenda entra filtrada en Hoy (sin aviso)", () => {
  const d = destinoEmbudo("fVisitas", "hoy", NOW);
  assert.equal(d.tab, "agenda"); assert.equal(d.intent!.filtro, "hoy"); assert.equal(d.intent!.filtroTipo, "cita");
  assert.equal(d.intent!.periodo, "hoy"); assert.ok(periodoSoportado("agenda", "hoy"));
});
test("Embudo Semana: lleva periodo y rango; Agenda y Estadísticas muestran el aviso", () => {
  const v = destinoEmbudo("fVentas", "semana", NOW);
  assert.equal(v.tab, "agenda"); assert.equal(v.intent!.filtro, "todas"); assert.equal(v.intent!.filtroResultado, "demo_venta");
  assert.equal(v.intent!.periodo, "semana"); assert.deepEqual(v.intent!.rango, { desde: "2026-09-21", hasta: HOY });
  assert.ok(!periodoSoportado("agenda", "semana"));
  const s = destinoEmbudo("fDemos", "semana", NOW);
  assert.equal(s.tab, "stats"); assert.equal(s.intent!.periodo, "semana"); assert.ok(!periodoSoportado("stats", "semana"));
});
test("Embudo Mes: Estadísticas ya muestra el mes actual (sin aviso); Agenda con aviso", () => {
  const s = destinoEmbudo("fVolumen", "mes", NOW);
  assert.equal(s.intent!.periodo, "mes"); assert.deepEqual(s.intent!.rango, { desde: "2026-09-01", hasta: HOY });
  assert.ok(periodoSoportado("stats", "mes"));
  assert.ok(!periodoSoportado("agenda", "mes"));
  ["fVisitas", "fDemos", "fVentas", "fVolumen"].forEach((k) => ["hoy", "semana", "mes"].forEach((p) =>
    assert.equal(destinoEmbudo(k, p as any, NOW).intent!.periodo, p, `${k}/${p}`)));
});
