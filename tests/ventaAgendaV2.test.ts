// Venta desde Agenda (v2): Demo / venta → otro resultado → (opcional) Demo / venta otra vez.
// Bug: la cita corregida seguía contando como venta en Distribución y en el Centro de mando.
// Se ejecuta con TZ de Texas.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  accionTrasActualizarCita, registroConVentaDeCita, reconciliarVentaAgendaEnEstado, reconciliarRegistroPorCita,
  entradaDeCita, MARCA_VENTA_AGENDA,
} from "../src/services/ventaAgendaV2";
import { reconciliarDistribucionPorVenta } from "../src/services/ventaDistribucionV2";
import { registrarResultado, sourceRecordForAppt } from "../src/services/agendaV2";
import { contarVentasDemosV2 } from "../src/services/serviceV2";
import { embudoComercial } from "../src/services/commandCenter";

const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const NOW = new Date(2026, 9, 27, 15, 0, 0);           // 27 oct 2026, 3:00 p. m. (Texas)
const T = (min: number) => new Date(NOW.getTime() + min * 60000);
const DIST = { uid: "dist1", nombre: "Tomas" };
const SUP = { uid: "sup1", nombre: "Eva" };
const FECHA_CITA = "2026-10-27T11:00";

// ── Réplica del orquestador de App (sincronizarVentaAgenda / corregirVentaAgenda, rama v2) ──
// Usa EXACTAMENTE las mismas funciones puras que App; solo arma el estado como App lo hace.
let n = 0;
function ventaInicial(s: any, apptId: any, now: Date, autor = DIST) {
  const appt = s.appts.find((a: any) => a.id === apptId);
  const src = sourceRecordForAppt(s, appt)!;
  const entrada = { id: `h${++n}`, tipo: "cita", estado: "", notas: `${MARCA_VENTA_AGENDA}${appt.producto ? ` — ${appt.producto}` : ""}`,
    agente: appt.agente || "", cita_resultado: "demo_venta", monto: Number(appt.monto) || 0, producto: appt.producto || "",
    cartucho_meses: Number(appt.cartucho_meses) || 0, fecha: now.toISOString(), apptId: appt.id };
  let out: any;
  if (src.section === "referidos") {
    out = { ...s, referidos: s.referidos.map((anf: any) => String(anf.id) !== src.id ? anf
      : { ...anf, referidos: anf.referidos.map((r: any, i: number) => (i === src.refIdx ? registroConVentaDeCita(r, appt, entrada, { historialSoloArreglo: true }) : r)) }) };
  } else {
    out = { ...s, [src.section]: s[src.section].map((c: any) => (String(c.id) === src.id ? registroConVentaDeCita(c, appt, entrada, { cartucho: true }) : c)) };
  }
  out.appts = out.appts.map((a: any) => (a.id === appt.id ? { ...a, _sincronizado: true, _clienteId: src.id, _clienteGrupo: src.section } : a));
  const r = reconciliarDistribucionPorVenta(out.distribucion, appt, now, autor);
  return r.accion !== "sin_cambios" && r.accion !== "omitido" ? { ...out, distribucion: r.lista } : out;
}
function corregir(s: any, apptId: any, now: Date, autor = DIST) {
  const actual = s.appts.find((a: any) => a.id === apptId);
  if (!actual._sincronizado) return s;
  const r = reconciliarVentaAgendaEnEstado(s, actual, sourceRecordForAppt(s, actual), now, autor);
  const d = reconciliarDistribucionPorVenta(r.state.distribucion, actual, now, autor);
  return d.accion !== "sin_cambios" && d.accion !== "omitido" ? { ...r.state, distribucion: d.lista } : r.state;
}
// Lo que hace la Agenda al tocar un resultado: setAppts(registrarResultado) y luego la acción.
function resultado(s: any, apptId: any, res: string, datos: any, now: Date, autor = DIST) {
  const s1 = { ...s, appts: s.appts.map((a: any) => (a.id === apptId ? registrarResultado(a, res, datos, autor, now) : a)) };
  const u = s1.appts.find((a: any) => a.id === apptId);
  const acc = accionTrasActualizarCita(u, true);
  return acc === "sincronizar" ? ventaInicial(s1, apptId, now, autor) : acc === "reconciliar" ? corregir(s1, apptId, now, autor) : s1;
}
const clientes = (s: any) => [...s.agregados, ...s.prospectos, ...s.distribucion.filter((r: any) => !r.eliminado), ...s.referidos, ...s.referidos.flatMap((a: any) => a.referidos)];
const metricas = (s: any) => contarVentasDemosV2({ appts: s.appts, clientes: clientes(s) });
const centroDeMando = (s: any) => embudoComercial(s, s.appts, "hoy", contarVentasDemosV2, T(60));
const fichasActivas = (s: any) => s.distribucion.filter((r: any) => !r.eliminado);
const refsActivas = (s: any, apptId: any) => fichasActivas(s).flatMap((r: any) => r.ventasOrigen || []).filter((v: any) => String(v.apptId) === String(apptId));
const cita = (x: any = {}) => ({ id: "ap1", tipo: "cita", _type: "cita", fecha: FECHA_CITA, nombre: "QA Cliente", telefono: "2545550101",
  sourceSection: "agregados", sourceRecordId: "c1", agente: "Tomas", ...x });
const base = (x: any = {}) => ({
  agregados: [{ id: "c1", nombre: "QA Cliente", telefono: "2545550101", historial: [] }],
  prospectos: [], distribucion: [], referidos: [], appts: [cita()], ...x,
});
const VENTA = { monto: 1, producto: "Sistema de cocina" };

test("sin resultado → demo_venta: 1 ficha en Distribución, Venta 1, Volumen $1, Demo 1", () => {
  const s = resultado(base(), "ap1", "demo_venta", VENTA, NOW);
  assert.equal(fichasActivas(s).length, 1);
  const f = fichasActivas(s)[0];
  assert.equal(f.id, "dv_ap1");
  assert.deepEqual([f.sourceSection, f.sourceRecordId], ["agregados", "c1"]);
  assert.equal(refsActivas(s, "ap1").length, 1);
  assert.deepEqual(metricas(s), { demos: 1, ventas: 1, volumen: 1, cierre: 100 });
  assert.deepEqual(centroDeMando(s), { visitas: 1, demos: 1, ventas: 1, volumen: 1 });
  // la entrada de historial queda ligada a ESTA cita
  assert.equal(s.agregados[0].historial[0].apptId, "ap1");
  assert.equal(s.agregados[0].venta, true);
});

test("demo_venta → demo_no_venta: Distribución reconciliada, ventasOrigen sin esa cita, Venta 0, Volumen 0, Demo 1", () => {
  const v = resultado(base(), "ap1", "demo_venta", VENTA, NOW);
  const s = resultado(v, "ap1", "demo_no_venta", {}, T(10));
  // Agenda
  assert.equal(s.appts[0].resultado, "demo_no_venta");
  // Distribución: auto-creada por esa venta y sin trabajo → papelera (SET, nunca borrado físico)
  assert.equal(s.distribucion.length, 1);
  const f = s.distribucion[0];
  assert.equal(f.eliminado, true);
  assert.equal(f.eliminadoMotivo, "Venta corregida");
  assert.deepEqual(f.ventasOrigen, []);
  assert.equal(fichasActivas(s).length, 0);
  // Registro de origen
  const c = s.agregados[0];
  assert.equal(c.venta, false);
  assert.equal(c.resultado, "demo_no_venta");
  assert.equal(c.historial.length, 1, "no se agrega ni se borra historial");
  assert.equal(c.historial[0].cita_resultado, "demo_no_venta");
  assert.equal(c.historial[0].monto, 0);
  assert.deepEqual(c.historial[0].ventaCorregida, { monto: 1, producto: "Sistema de cocina", cartucho_meses: 0 });
  // Métricas
  assert.deepEqual(metricas(s), { demos: 1, ventas: 0, volumen: 0, cierre: 0 });
  assert.deepEqual(centroDeMando(s), { visitas: 1, demos: 1, ventas: 0, volumen: 0 });
});

test("demo_venta → cada resultado no venta: no queda venta activa", () => {
  for (const r of ["no_recibio", "no_visito", "seguimiento", "reprogramada_visita", "demo_no_venta"]) {
    const s = resultado(resultado(base(), "ap1", "demo_venta", VENTA, NOW), "ap1", r, {}, T(10));
    const m = metricas(s);
    assert.equal(m.ventas, 0, r); assert.equal(m.volumen, 0, r);
    assert.equal(m.demos, r === "demo_no_venta" ? 1 : 0, r);
    assert.equal(refsActivas(s, "ap1").length, 0, r);
    assert.equal(s.agregados[0].venta, false, r);
    assert.equal(s.agregados[0].historial[0].cita_resultado, r, r);
  }
});

test("demo_venta → demo_no_venta → demo_venta: UNA ficha, UNA venta activa, sin duplicados", () => {
  let s = resultado(base(), "ap1", "demo_venta", VENTA, NOW);
  s = resultado(s, "ap1", "demo_no_venta", {}, T(10));
  s = resultado(s, "ap1", "demo_venta", VENTA, T(20));
  assert.equal(s.distribucion.length, 1, "la misma ficha revive, no se crea otra con el mismo id");
  assert.equal(fichasActivas(s).length, 1);
  assert.equal(refsActivas(s, "ap1").length, 1);
  const f = s.distribucion[0];
  assert.equal(f.eliminado, undefined); assert.equal(f.eliminadoMotivo, undefined);
  const hist = s.agregados[0].historial;
  assert.equal(hist.length, 1);
  assert.equal(hist.filter((h: any) => h.cita_resultado === "demo_venta").length, 1);
  assert.equal(hist[0].notas, `${MARCA_VENTA_AGENDA} — Sistema de cocina`, "la nota original vuelve");
  assert.equal(hist[0].ventaCorregida, undefined);
  assert.equal(hist[0].correcciones.length, 2);
  assert.equal(s.agregados[0].venta, true);
  assert.deepEqual(metricas(s), { demos: 1, ventas: 1, volumen: 1, cierre: 100 });
  // y se puede volver a corregir: la ficha revivida sigue sin trabajo → papelera otra vez
  s = resultado(s, "ap1", "no_recibio", {}, T(30));
  assert.equal(fichasActivas(s).length, 0);
  assert.equal(s.distribucion.length, 1);
  assert.deepEqual(metricas(s), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });
});

test("cliente con DOS ventas distintas: corregir una deja la otra activa y contándose", () => {
  let s = base({ appts: [cita(), cita({ id: "ap2", fecha: "2026-10-27T13:00" })] });
  s = resultado(s, "ap1", "demo_venta", { monto: 1, producto: "Sistema de cocina" }, NOW);
  s = resultado(s, "ap2", "demo_venta", { monto: 500, producto: "Extractor" }, T(5));
  assert.equal(fichasActivas(s).length, 1, "las dos ventas del mismo cliente comparten ficha");
  assert.equal(fichasActivas(s)[0].ventasOrigen.length, 2);
  s = resultado(s, "ap1", "demo_no_venta", {}, T(10));
  assert.equal(fichasActivas(s).length, 1, "la ficha sigue activa: tiene otra venta");
  assert.deepEqual(fichasActivas(s)[0].ventasOrigen.map((v: any) => v.apptId), ["ap2"]);
  const c = s.agregados[0];
  assert.equal(c.venta, true, "no se marca venta:false porque ap2 sigue vigente");
  assert.deepEqual(c.historial.map((h: any) => [h.apptId, h.cita_resultado, h.monto]), [["ap1", "demo_no_venta", 0], ["ap2", "demo_venta", 500]]);
  assert.deepEqual(metricas(s), { demos: 2, ventas: 1, volumen: 500, cierre: 50 });
});

test("referido con sourceRefId: la corrección afecta al MISMO referido aunque cambie de posición", () => {
  const anf = { id: "anf1", anfitrion: "QA Anfitrión", referidos: [
    { refId: "rA", nombre: "QA Ref A", telefono: "2545550201", historial: [] },
    { refId: "rB", nombre: "QA Ref B", telefono: "2545550202", historial: [] },
  ] };
  let s = base({ agregados: [], referidos: [anf],
    appts: [cita({ nombre: "QA Ref B", telefono: "2545550202", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefId: "rB", sourceRefIndex: 1 })] });
  s = resultado(s, "ap1", "demo_venta", VENTA, NOW);
  assert.equal(s.referidos[0].referidos[1].venta, true);
  // alguien reordena los referidos: rB queda primero
  s = { ...s, referidos: [{ ...s.referidos[0], referidos: [s.referidos[0].referidos[1], s.referidos[0].referidos[0]] }] };
  s = resultado(s, "ap1", "demo_no_venta", {}, T(10));
  const [b, a] = s.referidos[0].referidos;
  assert.equal(b.refId, "rB");
  assert.equal(b.venta, false);
  assert.equal(b.historial[0].cita_resultado, "demo_no_venta");
  assert.equal(a.refId, "rA");
  assert.equal(a.venta, undefined, "el otro referido no se toca");
  assert.deepEqual(a.historial, []);
  assert.deepEqual(metricas(s), { demos: 1, ventas: 0, volumen: 0, cierre: 0 });
});

test("supervisor corrige: la reconciliación son SETs (papelera), nunca borrado físico", () => {
  let s = resultado(base(), "ap1", "demo_venta", VENTA, NOW, SUP);
  const antes = s.distribucion.length;
  s = resultado(s, "ap1", "demo_no_venta", {}, T(10), SUP);
  assert.equal(s.distribucion.length, antes, "la ficha sigue en la lista");
  assert.equal(s.distribucion[0].eliminado, true);
  assert.equal(s.distribucion[0].eliminadoPorUid, "sup1");
  assert.equal(s.agregados.length, 1);
  assert.deepEqual(s.agregados[0].historial[0].correcciones.map((x: any) => [x.de, x.a, x.porUid]), [["demo_venta", "demo_no_venta", "sup1"]]);
});

test("ficha que ya existía en Distribución: queda activa y solo deja de mostrar esa venta", () => {
  let s = base({ distribucion: [{ id: "d9", nombre: "QA Cliente", telefono: "2545550101", historial: [{ tipo: "llamada" }] }] });
  s = resultado(s, "ap1", "demo_venta", VENTA, NOW);
  assert.equal(fichasActivas(s).length, 1);
  assert.equal(fichasActivas(s)[0].id, "d9");
  s = resultado(s, "ap1", "demo_no_venta", {}, T(10));
  assert.equal(fichasActivas(s).length, 1);
  assert.deepEqual(fichasActivas(s)[0].ventasOrigen, []);
});

test("compatibilidad: entrada antigua SIN apptId solo se asocia si es la única candidata exacta", () => {
  const legacy = (id: string, monto: number) => ({ id, tipo: "cita", cita_resultado: "demo_venta", notas: `${MARCA_VENTA_AGENDA} — Sistema de cocina`, monto, producto: "Sistema de cocina", fecha: NOW.toISOString() });
  const appt = { ...cita(), resultado: "demo_no_venta", monto: 1, producto: "Sistema de cocina", _sincronizado: true };
  // única candidata → se asocia y queda sellada con apptId
  const r1 = reconciliarRegistroPorCita({ id: "c1", venta: true, resultado: "demo_venta", historial: [legacy("h1", 1)] }, appt, T(10), DIST, { cartucho: true });
  assert.equal(r1.cambio, "corregida"); assert.equal(r1.via, "legacy_unico");
  assert.equal(r1.registro.historial[0].apptId, "ap1");
  // dos candidatas iguales → ambigua: NO se toca nada
  const dos = { id: "c1", venta: true, resultado: "demo_venta", historial: [legacy("h1", 1), legacy("h2", 1)] };
  const r2 = reconciliarRegistroPorCita(dos, appt, T(10), DIST);
  assert.equal(r2.cambio, "no_asociada"); assert.equal(r2.registro, dos);
  // monto distinto → no es esa venta
  assert.equal(entradaDeCita([legacy("h1", 900)], appt), null);
});

test("acción tras actualizar una cita: legacy (v2 = false) idéntico a la condición de siempre", () => {
  const siempre = (u: any) => (u.resultado === "demo_venta" && !u._sincronizado ? "sincronizar" : null);
  const casos = [
    { resultado: "demo_venta" }, { resultado: "demo_venta", _sincronizado: true }, { resultado: "demo_no_venta" },
    { resultado: "demo_no_venta", _sincronizado: true }, { resultado: "" }, { resultado: "no_recibio", _sincronizado: true },
    { tipo: "servicio", resultado: "venta_servicio", _sincronizado: true },
  ];
  for (const u of casos) assert.equal(accionTrasActualizarCita(u, false), siempre(u), JSON.stringify(u));
  // v2: una cita sincronizada que cambia → reconciliar; servicios siguen su propio flujo
  assert.equal(accionTrasActualizarCita({ resultado: "demo_no_venta", _sincronizado: true }, true), "reconciliar");
  assert.equal(accionTrasActualizarCita({ tipo: "servicio", resultado: "venta_servicio", _sincronizado: true }, true), null);
});

test("App: legacy sin cambios — la corrección solo existe en v2 y solo para staff", () => {
  assert.ok(APP.includes("onVentaCorreccion:corregirVentaAgenda}:{})}"), "la prop solo se pasa con ACCESS_V2 && v2User");
  assert.ok(APP.includes("if(!ACCESS_V2 || !v2User || !canRecordVisitResult(v2User.role) || !appt) return;"));
  assert.ok(APP.includes("...(ACCESS_V2?{ apptId:appt.id }:{})"), "apptId en el historial solo en v2");
  assert.ok(APP.includes(": {...c, venta:true, resultado:\"demo_venta\", ultimo_monto_venta:monto||c.ultimo_monto_venta"), "rama legacy intacta");
  assert.equal((APP.match(/trasActualizarCita\(u\)/g) || []).length, 2);
});
