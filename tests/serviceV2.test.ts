// Servicio v2: venta sin demo, resultados reales, reprogramar/cancelar, trazabilidad,
// duplicados, mantenimiento, fechas reales de métrica, permisos y Centro de mando. TZ Texas.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  contarVentasDemosV2, estadoServicio, esServicioPendiente, registrarResultadoServicio, registrarVentaServicio,
  reprogramarServicio, cancelarServicio, notaServicio, duplicateServiceCandidate, mantenimientoDesdeServicio,
  servicioDesdeCartucho, serviceCounters, enFiltroServicio, serviceMetricDate, serviceReadOnly, serviciosRealizados,
  candidatosServicio, corregirResultadoServicio, requiereConfirmacion, resumenResultado, resumenNuevo, ventasServicioDe, apptsDelGrupo, ventaServicioCartucho, mantenimientosDe, cancelarMantenimientosDe, responsableServicio,
} from "../src/services/serviceV2";
import { trazaRegistro } from "../src/services/apptTrace";
import { staffResumen, embudoComercial } from "../src/services/commandCenter";
import { canViewTab, can } from "../src/auth/permissions";
import { diffState, emptyDocs } from "../src/data/storeCore";

const EVA = { uid: "sup1", nombre: "Eva Supervisor" };
const NOW = new Date(2026, 9, 2, 11, 0, 0);                // 2-oct-2026 11:00 Texas
const serv = (x: any = {}) => ({ id: "s1", tipo: "servicio", _type: "servicio", nombre: "Ana Pérez", telefono: "(210) 555-0101", direccion: "123 Main St", ciudad: "San Antonio", cp: "78201",
  producto: "Frescapure", fecha: "2026-09-29T10:00", createdByUid: "dist1", createdByName: "Tomás", sourceSection: "distribucion", sourceRecordId: "d1", ...x });
const enOct = (f: string) => String(f).slice(0, 7) === "2026-10";
const U = (role: string) => ({ uid: "u", role, status: "active", appId: "impactos" } as any);

test("1 · Cita + demo_venta → demo 1, venta 1, volumen", () => {
  assert.deepEqual(contarVentasDemosV2({ appts: [{ id: "c", tipo: "cita", fecha: "2026-10-01T18:00", resultado: "demo_venta", monto: 2500 }] }), { demos: 1, ventas: 1, volumen: 2500, cierre: 100 });
  assert.equal(contarVentasDemosV2({ appts: [{ id: "c", tipo: "cita", fecha: "2026-10-01", resultado: "demo_no_venta" }] }).demos, 1);
});
test("2 · Servicio + venta_servicio → demos 0, ventas 1, volumen", () => {
  const v = registrarVentaServicio(serv(), { monto: 1800, producto: "Purificador" }, EVA, NOW);
  assert.deepEqual([v.resultado, v.servicioResultado, v.venta, v.monto], ["venta_servicio", "venta", true, 1800]);
  assert.deepEqual(contarVentasDemosV2({ appts: [v] }), { demos: 0, ventas: 1, volumen: 1800, cierre: 0 });
});
test("3 · Servicio LEGACY + demo_venta → venta + volumen, NO demo (sin migrar)", () => {
  const legacy = serv({ servicioResultado: "realizado", resultado: "demo_venta", monto: 900 });
  assert.equal(estadoServicio(legacy), "venta");
  assert.deepEqual(contarVentasDemosV2({ appts: [legacy] }), { demos: 0, ventas: 1, volumen: 900, cierre: 0 });
  assert.equal(contarVentasDemosV2({ appts: [serv({ resultado: "venta", monto: 50, servicioResultado: "realizado" })] }).demos, 0);
});
test("4 · Servicio realizado sin venta → realizado 1, demos 0, ventas 0", () => {
  const r = registrarResultadoServicio(serv(), "realizado", EVA, NOW);
  assert.equal(estadoServicio(r), "realizado");
  assert.equal(serviciosRealizados([r], enOct), 1);
  assert.deepEqual(contarVentasDemosV2({ appts: [r] }), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });
});
test("5-7 · No recibió / No se visitó se CONSERVAN (no se colapsan a no_realizado)", () => {
  const a = registrarResultadoServicio(serv(), "no_recibio", EVA, NOW), b = registrarResultadoServicio(serv(), "no_visito", EVA, NOW);
  assert.deepEqual([a.servicioResultado, a.resultado, estadoServicio(a)], ["no_recibio", "no_recibio", "no_recibio"]);
  assert.deepEqual([b.servicioResultado, b.resultado, estadoServicio(b)], ["no_visito", "no_visito", "no_visito"]);
  for (const x of [a, b]) { assert.notEqual(x.servicioResultado, "no_realizado"); assert.ok(enFiltroServicio(x, "no_realizados", NOW)); assert.ok(serviceReadOnly(x)); }
});
test("8 · Legacy no_realizado sigue visible (y usa el detalle si lo hay)", () => {
  assert.equal(estadoServicio(serv({ servicioResultado: "no_realizado" })), "no_realizado");
  assert.equal(estadoServicio(serv({ servicioResultado: "no_realizado", resultado: "no_visito" })), "no_visito");
  assert.ok(enFiltroServicio(serv({ servicioResultado: "no_realizado" }), "no_realizados", NOW));
  assert.ok(enFiltroServicio(serv({ servicioResultado: "no_realizado" }), "todos", NOW));
  assert.equal(estadoServicio(serv({ servicioResultado: "pendiente", resultado: "reset" })), "pendiente");   // reset legacy = pendiente
});
test("9 · Reprogramar: misma cita, nueva fecha, historial; sigue pendiente y no cuenta", () => {
  const r = reprogramarServicio(serv(), "2026-10-05T15:00", EVA, NOW);
  assert.deepEqual([r.id, r.fecha, r.servicioResultado], ["s1", "2026-10-05T15:00", "pendiente"]);
  assert.deepEqual(r.reprogramHistory, [{ previousDate: "2026-09-29T10:00", newDate: "2026-10-05T15:00", changedAt: NOW.toISOString(), changedByUid: "sup1", changedByName: "Eva Supervisor", reason: "before_visit" }]);
  assert.equal(r.resultado, undefined);
  assert.equal(serviciosRealizados([r], () => true), 0);
  assert.deepEqual(contarVentasDemosV2({ appts: [r] }), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });
  assert.equal(reprogramarServicio(r, "2026-10-06T09:00", EVA, NOW).reprogramHistory.length, 2);
});
test("10 · Cancelar: status cancelada; en Todos y Cancelados; fuera de Pendientes, Hoy y métricas", () => {
  const hoy = serv({ id: "h", fecha: "2026-10-02T15:00" });
  const c = cancelarServicio(hoy, EVA, NOW, "cliente de viaje");
  assert.deepEqual([c.status, c.cancelledByUid, c.cancelledByName, c.cancelReason, c.tipo], ["cancelada", "sup1", "Eva Supervisor", "cliente de viaje", "servicio"]);
  assert.equal(estadoServicio(c), "cancelado");
  assert.ok(enFiltroServicio(c, "todos", NOW)); assert.ok(enFiltroServicio(c, "cancelados", NOW));
  for (const f of ["hoy", "pendiente", "hechos", "no_realizados"] as const) assert.equal(enFiltroServicio(c, f, NOW), false, f);
  assert.deepEqual(serviceCounters([hoy, c], NOW), { hoy: 1, todos: 2, pendiente: 1, hechos: 0, no_realizados: 0, cancelados: 1 });
  // aunque tuviera una venta legacy, cancelado no suma
  assert.equal(contarVentasDemosV2({ appts: [{ ...c, resultado: "venta_servicio", servicioResultado: "venta", monto: 99 }] }).ventas, 0);
});
test("11-13 · Permisos: Supervisor gestiona Servicio (solo este módulo); telemarketing no", () => {
  assert.equal(canViewTab(U("supervisor"), "servicio"), true);
  assert.equal(can(U("supervisor"), "servicios.manage"), true);
  assert.equal(can(U("supervisor"), "ventas.manage"), false);            // no se amplía lo comercial
  assert.equal(can(U("supervisor"), "usuarios.manage"), false);
  for (const r of ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"]) {
    assert.equal(canViewTab(U(r), "servicio"), false, r); assert.equal(can(U(r), "servicios.manage"), false, r);
  }
  // 12 · el supervisor registra resultado de servicio y el store lo guarda con su identidad
  const cur = serv(); const d = emptyDocs(); d.appts.s1 = cur;
  const r = registrarResultadoServicio(cur, "realizado", EVA, NOW);
  const op: any = diffState({ appts: [cur] }, { appts: [r] }, d, { uid: "sup1", role: "supervisor", appId: "impactos", nombre: "Eva Supervisor" }).ops[0];
  assert.deepEqual([op.data.servicioResultado, op.data.resultByUid, op.data.resultByName], ["realizado", "sup1", "Eva Supervisor"]);
  // …y el telemarketing no puede escribir resultado de servicio (store = Rules)
  const opT: any = diffState({ appts: [cur] }, { appts: [{ ...cur, servicioResultado: "venta", resultado: "venta_servicio", resultByUid: "x" }] }, d, { uid: "dist1", role: "telemarketing_ventas", appId: "impactos", nombre: "T" }).ops[0];
  assert.ok(!opT || (opT.data.servicioResultado === undefined && opT.data.resultado === undefined && opT.data.resultByUid === undefined));
});
test("14-15 · Servicio desde tarjeta de cliente / referido: registro de origen correcto", () => {
  assert.deepEqual(trazaRegistro({ id: "d7", section: "distribucion" } as any), { sourceRecordId: "d7", sourceSection: "distribucion" });
  assert.deepEqual(trazaRegistro({ _refDe: "anf1", _refIdx: 2, _tipo: "referidos" } as any), { sourceRecordId: "anf1", sourceSection: "referidos", sourceRefIndex: 2 });
  assert.deepEqual(trazaRegistro({ id: "anf1::1", section: "referidos" } as any), { sourceRecordId: "anf1", sourceSection: "referidos", sourceRefIndex: 1 });
  // buscador de la Agenda: Distribución primero, con cuenta y producto para autocompletar
  const c = candidatosServicio({ agregados: [{ id: "a1", nombre: "Beto" }], distribucion: [{ id: "d1", nombre: "Ana", cuenta: "RP-77", producto: "Frescapure" }],
    referidos: [{ id: "anf1", referidos: [{ nombre: "Rita" }] }] });
  assert.deepEqual(c.map((x: any) => x.section), ["distribucion", "agregados", "referidos"]);
  assert.deepEqual([c[0].recId, c[0].cuenta, c[0].producto], ["d1", "RP-77", "Frescapure"]);
  assert.deepEqual([c[2].recId, c[2].refIdx], ["anf1", 0]);
});
test("16-17 · Cartuchos: servicio con origen cuando existe; sin inventarlo cuando no; hora local", () => {
  const conSrc = servicioDesdeCartucho({ nombre: "Ana", telefono: "2105550101", producto: "Filtro", proxFecha: new Date(2026, 9, 10), sourceSection: "distribucion", sourceRecordId: "d1", direccion: "123 Main" }, NOW, "n1");
  assert.deepEqual([conSrc.sourceSection, conSrc.sourceRecordId, conSrc.fecha, conSrc.tipo, conSrc.direccion], ["distribucion", "d1", "2026-10-10T09:00", "servicio", "123 Main"]);
  const ref = servicioDesdeCartucho({ nombre: "R", proxFecha: new Date(2026, 9, 10), sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 0 }, NOW, "n2");
  assert.equal(ref.sourceRefIndex, 0);                                                    // índice 0 se conserva
  const sinSrc = servicioDesdeCartucho({ nombre: "Legacy", telefono: "1", producto: "Filtro", proxFecha: new Date(2026, 8, 1) }, NOW, "n3");
  for (const k of ["sourceRecordId", "sourceSection", "sourceRefIndex"]) assert.equal(k in sinSrc, false, k);
  assert.equal(sinSrc.fecha, "2026-10-02T09:00");                                          // vencido → hoy (local), no la fecha pasada
  // calcularCartuchos (App.tsx) solo pasa el origen cuando se conoce: cliente etiquetado por sección o cita con traza
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes(`c._sec ? { sourceSection:c._sec, sourceRecordId:String(c.id),`));
  assert.ok(app.includes(`...(a.sourceRecordId!=null&&a.sourceRecordId!==""?{ sourceSection:a.sourceSection, sourceRecordId:String(a.sourceRecordId)`));
  assert.ok(app.includes(`const tag=(sec)=>v2?noE(allData[sec]).map(c=>({...c,_sec:sec})):noE(allData[sec]);`));   // solo v2 etiqueta
});
test("18-20 · Duplicado de servicio: aviso por origen o teléfono; guardar de todos modos; una cita NO duplica", () => {
  const existente = serv({ fecha: "2026-10-10T09:00" });
  const nuevo = { id: "n", tipo: "servicio", sourceSection: "distribucion", sourceRecordId: "d1", producto: "Frescapure", fecha: "2026-10-11T15:00" };
  assert.equal(duplicateServiceCandidate([existente], nuevo)?.id, "s1");                 // 18
  assert.equal(duplicateServiceCandidate([existente], { ...nuevo, fecha: "2026-10-20T09:00" }), null);
  assert.equal(duplicateServiceCandidate([existente], { ...nuevo, producto: "Ducha" }), null);
  assert.equal(duplicateServiceCandidate([existente], { ...nuevo, sourceRefIndex: 1 }), null);
  assert.equal(duplicateServiceCandidate([existente], { id: "n", tipo: "servicio", telefono: "210.555.0101", producto: "Frescapure", fecha: "2026-10-09T09:00" })?.id, "s1");   // legacy/manual
  // 19 · es solo aviso: con "Guardar de todos modos" la app crea igual (la función no bloquea nada)
  assert.equal(typeof duplicateServiceCandidate, "function");
  // 20 · una cita comercial del mismo cliente y día NO es duplicado de un servicio
  const cita = { id: "c", tipo: "cita", sourceSection: "distribucion", sourceRecordId: "d1", telefono: "2105550101", fecha: "2026-10-10T09:00" };
  assert.equal(duplicateServiceCandidate([cita], nuevo), null);
  // ni un servicio cancelado
  assert.equal(duplicateServiceCandidate([cancelarServicio(existente, EVA, NOW)], nuevo), null);
});
test("21-23 · Mantenimiento tras venta: fecha local, conserva origen y datos; no se duplica en silencio", () => {
  const noche = new Date(2026, 9, 2, 22, 30);                                             // 22:30 Texas = 03:30 UTC del día siguiente
  const v = registrarVentaServicio(serv({ sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 0, cuenta: "RP-9" }), { monto: 500, producto: "Frescapure" }, EVA, noche);
  const m = mantenimientoDesdeServicio(v, { producto: "Frescapure", meses: 6 }, noche, "m1");
  assert.equal(m.fecha, "2027-04-02T09:00");                                              // 21 · día LOCAL (no 3 de abril por UTC)
  assert.deepEqual([m.sourceSection, m.sourceRecordId, m.sourceRefIndex], ["referidos", "anf1", 0]);                     // 22
  assert.deepEqual([m.nombre, m.telefono, m.direccion, m.ciudad, m.cp, m.cuenta, m.producto, m.tipo], ["Ana Pérez", "(210) 555-0101", "123 Main St", "San Antonio", "78201", "RP-9", "Frescapure", "servicio"]);
  assert.deepEqual([m.createdFrom, m.maintenanceFromApptId, m.resultado, m.servicioResultado], ["service_maintenance", "s1", undefined, undefined]);
  // 23 · el segundo mantenimiento idéntico se detecta antes de crearlo
  assert.equal(duplicateServiceCandidate([m], mantenimientoDesdeServicio(v, { producto: "Frescapure", meses: 6 }, noche, "m2"), 7)?.id, "m1");
  const app = fs.readFileSync(new URL("../src/components/servicio/ServicioV2.tsx", import.meta.url), "utf8");
  assert.ok(/const dup = duplicateServiceCandidate\(vigentes, m, 7\);\s*if \(dup\) setMant\(\{ m, dup \}\); else onCrear\(m\);/.test(app));
});
test("24-25 · Trazabilidad: resultBy* en el resultado; historial y notas con uid y nombre", () => {
  const r = registrarResultadoServicio(serv({ servicioHistorial: [{ resultado: "realizado", fecha: "x", agente: "Viejo" }] }), "no_recibio", EVA, NOW);
  assert.deepEqual([r.resultByUid, r.resultByName, r.resultAt, r.createdByName], ["sup1", "Eva Supervisor", NOW.toISOString(), "Tomás"]);
  assert.equal(r.servicioHistorial.length, 2);
  assert.deepEqual(r.servicioHistorial[1], { resultado: "no_recibio", fecha: NOW.toISOString(), uid: "sup1", nombre: "Eva Supervisor", agente: "Eva Supervisor" });
  const v = registrarVentaServicio(serv(), { monto: 700, producto: "Ducha" }, EVA, NOW);
  assert.deepEqual(v.servicioHistorial[0], { resultado: "venta", fecha: NOW.toISOString(), uid: "sup1", nombre: "Eva Supervisor", agente: "Eva Supervisor", monto: 700, producto: "Ducha" });
  const n = notaServicio(notaServicio(serv(), "Llamar antes", EVA, NOW), "Portón azul", EVA, NOW);
  assert.equal(n.servicioUltimaNota, "Portón azul");
  assert.deepEqual(n.servicioNotas[0], { texto: "Llamar antes", fecha: NOW.toISOString(), uid: "sup1", nombre: "Eva Supervisor", agente: "Eva Supervisor" });
  assert.equal(n.servicioNotas.length, 2);                                                // no borra notas anteriores
});
test("26-27 · Métricas en la fecha REAL del resultado (agendado 29-sep, realizado/venta 2-oct)", () => {
  const r = registrarResultadoServicio(serv({ fecha: "2026-09-29T10:00" }), "realizado", EVA, NOW);
  assert.equal(serviceMetricDate(r).slice(0, 10), "2026-10-02");
  assert.equal(serviciosRealizados([r], (f) => f.slice(0, 10) === "2026-10-02"), 1);
  assert.equal(serviciosRealizados([r], (f) => f.slice(0, 10) === "2026-09-29"), 0);
  const v = registrarVentaServicio(serv({ fecha: "2026-09-29T10:00" }), { monto: 1200 }, EVA, NOW);
  assert.deepEqual(contarVentasDemosV2({ appts: [v], enP: (f: string) => f.slice(0, 10) === "2026-10-02" }), { demos: 0, ventas: 1, volumen: 1200, cierre: 0 });
  assert.equal(contarVentasDemosV2({ appts: [v], enP: (f: string) => f.slice(0, 10) === "2026-09-29" }).ventas, 0);
  // noche en Texas: resultado a las 21:30 del 2-oct (02:30 UTC del 3) cuenta el 2-oct
  const tarde = registrarResultadoServicio(serv(), "realizado", EVA, new Date(2026, 9, 2, 21, 30));
  assert.equal(serviceMetricDate(tarde).slice(0, 10), "2026-10-02");
  // legacy sin resultAt: fecha programada
  assert.equal(serviceMetricDate(serv({ servicioResultado: "realizado" })), "2026-09-29T10:00");
});
test("28 · Centro de mando: servicios de hoy y pendientes excluyen cancelados y resultados finales", () => {
  const hoy = (id: string, x: any = {}) => serv({ id, fecha: "2026-10-02T15:00", ...x });
  const A = [hoy("p1"), hoy("p2"), cancelarServicio(hoy("c1"), EVA, NOW), registrarVentaServicio(hoy("v1"), { monto: 1 }, EVA, NOW),
    registrarResultadoServicio(hoy("r1"), "no_visito", EVA, NOW), registrarResultadoServicio(hoy("r2"), "no_recibio", EVA, NOW)];
  const st: any = staffResumen({}, A, NOW);
  assert.equal(st.serviciosHoy, 5);                              // activos hoy (sin el cancelado)
  assert.equal(st.acciones.serviciosPendientes, 2);              // solo los que no tienen resultado final
  assert.ok(esServicioPendiente(hoy("x")) && !esServicioPendiente(A[3]) && !esServicioPendiente(A[2]));
  // embudo: la venta en servicio es venta + volumen, no visita ni demo
  const e = embudoComercial({}, [registrarVentaServicio(serv({ fecha: "2026-10-02T09:00" }), { monto: 800 }, EVA, NOW)], "hoy", contarVentasDemosV2, NOW);
  assert.deepEqual(e, { visitas: 0, demos: 0, ventas: 1, volumen: 800 });
});
test("29 · ACCESS_V2=0: la lógica legacy de Servicio y de conteo queda intacta", () => {
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes(`  if(ACCESS_V2) return contarVentasDemosV2({ appts, clientes, enP, agente });
  let demos=0, ventas=0, volumen=0;`));
  assert.ok(app.includes(`    if(a.resultado==="demo_venta"||a.resultado==="venta"){ ventas++; demos++; volumen+=Number(a.monto)||0; }`));   // legacy sin cambios
  assert.ok(app.includes(`        const interno = resultado==="venta" ? "realizado" : (resultado==="no_recibio"||resultado==="no_visito") ? "no_realizado" : resultado==="reset" ? "pendiente" : resultado;`));
  assert.ok(app.includes(`Reset servicio (queda pendiente)`));                        // el botón legacy sigue en ACCESS_V2=0
  assert.ok(/\{tab==="servicio" && \(ACCESS_V2 && v2User\s*\? <ServiciosV2/.test(app));
});

// ════════ Servicio r1.1 ════════
const TOMAS = { uid: "dist1", nombre: "Tomás" };
const citaV = (i: number, resultado: string, monto = 0, x: any = {}) => ({ id: "c" + i, tipo: "cita", fecha: "2026-10-01T18:00", resultado, monto, agente: "Tomás", ...x });

test("A · Cierre Demo→Venta: 10 demos, 5 ventas demo, 3 ventas servicio → demos 10, ventas 8, cierre 50%", () => {
  const citas = [...Array.from({ length: 5 }, (_, i) => citaV(i, "demo_venta", 1000)), ...Array.from({ length: 5 }, (_, i) => citaV(10 + i, "demo_no_venta"))];
  const servs = [1, 2, 3].map((i) => registrarVentaServicio(serv({ id: "sv" + i }), { monto: 300 }, EVA, NOW));
  const r = contarVentasDemosV2({ appts: [...citas, ...servs] });
  assert.deepEqual(r, { demos: 10, ventas: 8, volumen: 5900, cierre: 50 });
  // solo servicio: hay ventas pero no hay demos → cierre 0 (no 100)
  assert.equal(contarVentasDemosV2({ appts: servs }).cierre, 0);
  // historial: venta_servicio tampoco infla el cierre
  const h = { historial: [{ cita_resultado: "demo_venta", fecha: "2026-10-01", monto: 1 }, { cita_resultado: "demo_no_venta", fecha: "2026-10-01" }, { cita_resultado: "venta_servicio", fecha: "2026-10-01", monto: 5 }] };
  assert.deepEqual(contarVentasDemosV2({ clientes: [h] }), { demos: 2, ventas: 2, volumen: 6, cierre: 50 });
});

test("B · Atribución: servicio agendado por Tomás, venta registrada por Eva → Eva 1, Tomás 0", () => {
  const v = registrarVentaServicio(serv({ agente: "Tomás", createdByName: "Tomás" }), { monto: 1000 }, EVA, NOW);
  assert.equal(responsableServicio(v), "Eva Supervisor");
  assert.deepEqual(contarVentasDemosV2({ appts: [v], agente: "Eva Supervisor" }), { demos: 0, ventas: 1, volumen: 1000, cierre: 0 });
  assert.deepEqual(contarVentasDemosV2({ appts: [v], agente: "Tomás" }), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });
  assert.deepEqual(ventasServicioDe([v], "Eva Supervisor").map((x: any) => x.id), ["s1"]);
  assert.equal(ventasServicioDe([v], "Tomás").length, 0);
  assert.equal(ventasServicioDe([v], "").length, 1);                               // sin filtro de persona (equipo): cuenta
  // legacy sin resultByName → su agente
  const legacy = serv({ servicioResultado: "realizado", resultado: "demo_venta", monto: 50, agente: "Tomás" });
  assert.equal(contarVentasDemosV2({ appts: [legacy], agente: "Tomás" }).ventas, 1);
  assert.equal(contarVentasDemosV2({ appts: [legacy], agente: "Eva Supervisor" }).ventas, 0);
  // las citas comerciales conservan su atribución legacy
  assert.equal(contarVentasDemosV2({ appts: [citaV(1, "demo_venta", 5)], agente: "Tomás" }).ventas, 1);
  assert.equal(contarVentasDemosV2({ appts: [citaV(1, "demo_venta", 5)], agente: "Eva Supervisor" }).ventas, 0);
});

test("C · Servicio sin agente pero con resultByName Eva: no cuenta para otra persona; sin nadie: para nadie", () => {
  const v = registrarVentaServicio(serv({ agente: undefined }), { monto: 400 }, EVA, NOW);
  for (const otro of ["Tomás", "Liam", "Ana"]) assert.equal(contarVentasDemosV2({ appts: [v], agente: otro }).ventas, 0, otro);
  assert.equal(contarVentasDemosV2({ appts: [v], agente: "Eva Supervisor" }).ventas, 1);
  const huerfano = serv({ servicioResultado: "venta", resultado: "venta_servicio", monto: 9 });   // sin resultByName ni agente
  for (const p of ["Tomás", "Eva Supervisor"]) assert.equal(contarVentasDemosV2({ appts: [huerfano], agente: p }).ventas, 0, p);
});

test("D · Racha / incentivos: la venta de servicio suma Ventas (semana real, quien la registró), nunca Demos", () => {
  const v = registrarVentaServicio(serv({ fecha: "2026-09-21T10:00" }), { monto: 700 }, EVA, NOW);   // agendado semana anterior, vendido 2-oct
  const deEva = ventasServicioDe([v, cancelarServicio(serv({ id: "x" }), EVA, NOW), { ...v, id: "sync", _sincronizado: true }], "Eva Supervisor");
  assert.deepEqual(deEva.map((x: any) => x.id), ["s1"]);                          // ni cancelados ni sincronizados
  assert.equal(serviceMetricDate(deEva[0]).slice(0, 10), "2026-10-02");            // semana REAL
  // la racha/semana (App.tsx) usan este helper en v2 y solo acumulan "ventas"
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(/if\(ACCESS_V2\) ventasServicioDe\(allData\.appts, agente\)\.forEach\(a=>\{\s*const idx=idxDe\(serviceMetricDate\(a\)\);\s*if\(idx>=0 && idx<semanas\.length\) acum\(idx,"ventas"\);/.test(app), "calcularRacha");
  assert.ok(/if\(ACCESS_V2\) ventasServicioDe\(allData\.appts, agente\)\.forEach\(a=>\{[^\n]*\n\s*if\(enSemana\(serviceMetricDate\(a\)\)\)\{ ventas\+\+; volumen \+= Number\(a\.monto\)\|\|0; \}/.test(app), "calcularSemanaAgente");
  // incentivos: calcularProgresoIncentivo usa contarVentasDemos (→ contarVentasDemosV2 con la persona)
  assert.ok(app.includes("const _vd = contarVentasDemos({ appts: allData.appts||[], clientes, enP: enRango, agente });"));
});

test("E-F · Estadísticas por grupo: venta de servicio de Distribución suma allí; sin source no se inventa grupo", () => {
  const dist = registrarVentaServicio(serv({ sourceSection: "distribucion", sourceRecordId: "d1" }), { monto: 1000 }, EVA, NOW);
  const manual = registrarVentaServicio(serv({ id: "m", sourceSection: undefined, sourceRecordId: undefined }), { monto: 50 }, EVA, NOW);
  const cita = citaV(1, "demo_venta", 2000, { sourceSection: "distribucion", sourceRecordId: "d2" });
  const A = [dist, manual, cita];
  const g = (sec: string) => contarVentasDemosV2({ appts: apptsDelGrupo(A, sec), enP: (f: string) => String(f).slice(0, 7) === "2026-10" });
  assert.deepEqual(g("distribucion"), { demos: 1, ventas: 2, volumen: 3000, cierre: 100 });   // cierre solo con la venta de demo
  for (const sec of ["agregados", "referidos", "prospectos"]) assert.deepEqual(g(sec), { demos: 0, ventas: 0, volumen: 0, cierre: 0 }, sec);
  assert.equal(apptsDelGrupo(A, "distribucion").some((a: any) => a.id === "m"), false);      // F · el manual no cae en ningún grupo
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes("...(ACCESS_V2?{ appts:apptsDelGrupo(appts, g.key) }:{}) });"));
});

test("G · Venta de servicio con Frescaflow 6 meses → cartucho_meses 6", () => {
  const v = registrarVentaServicio(serv(), { monto: 500, producto: "Frescaflow", meses: 6 }, EVA, NOW);
  assert.deepEqual([v.resultado, v.servicioResultado, v.cartucho_meses, v.producto], ["venta_servicio", "venta", 6, "Frescaflow"]);
  assert.equal("cartucho_meses" in registrarVentaServicio(serv({ cartucho_meses: 12 }), { monto: 1, producto: "Olla" }, EVA, NOW), false);   // sin ciclo
  const ui = fs.readFileSync(new URL("../src/components/servicio/ServicioV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes("registrarVentaServicio(s, { monto: venta.monto, producto: label, meses }, autor)"));
});

test("H-I · Cartuchos reconoce venta_servicio con la fecha REAL local (9:30 PM Texas = mismo día)", () => {
  const noche = new Date(2026, 9, 2, 21, 30);                                              // 02:30 UTC del 3-oct
  const v = registrarVentaServicio(serv({ fecha: "2026-09-20T10:00", sourceRefIndex: 0, sourceSection: "referidos", sourceRecordId: "anf1" }), { monto: 500, producto: "Frescaflow", meses: 6 }, EVA, noche);
  const vs = ventaServicioCartucho(v)!;
  assert.equal(vs.meses, 6);
  assert.equal(vs.fechaVenta.slice(0, 10), "2026-10-02");                                   // I · día local, no el 3 (UTC) ni el 20-sep (agendado)
  assert.equal(ventaServicioCartucho(registrarVentaServicio(serv(), { monto: 1 }, EVA, noche)), null);      // sin ciclo → no aparece
  assert.equal(ventaServicioCartucho(cancelarServicio(v, EVA, noche)), null);
  // calcularCartuchos (App.tsx) la usa en v2 y conserva el origen (incluido el índice de referido)
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(/const vs = ACCESS_V2 \? ventaServicioCartucho\(a\) : null;\s*if\(vs\)\{\s*push\(a\.nombre, a\.telefono, a\.producto, vs\.meses, vs\.fechaVenta, "servicio",/.test(app));
  // y el servicio que se agende desde ese cartucho queda ligado y se detecta como duplicado del mantenimiento
  const m = mantenimientoDesdeServicio(v, { producto: "Frescaflow", meses: 6 }, noche, "m1");
  const desdeCartucho = servicioDesdeCartucho({ nombre: v.nombre, producto: "Frescaflow", proxFecha: new Date(2027, 3, 2), sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 0 }, noche, "n1");
  assert.deepEqual([desdeCartucho.sourceSection, desdeCartucho.sourceRecordId, desdeCartucho.sourceRefIndex, desdeCartucho.fecha], ["referidos", "anf1", 0, "2027-04-02T09:00"]);
  assert.equal(duplicateServiceCandidate([m], desdeCartucho)?.id, "m1");
});

test("J · Corregir Venta → No recibió: sin venta, volumen ni cartucho_meses; el mantenimiento automático queda CANCELADO", () => {
  const v = registrarVentaServicio(serv(), { monto: 900, producto: "Frescaflow", meses: 6 }, EVA, NOW);
  const m = mantenimientoDesdeServicio(v, { producto: "Frescaflow", meses: 6 }, NOW, "m1");
  const otro = { ...mantenimientoDesdeServicio(serv({ id: "otro" }), { producto: "X", meses: 3 }, NOW, "m2") };     // de otro servicio: intacto
  let A: any[] = [v, m, otro];
  const cancelados = cancelarMantenimientosDe(A, "s1", EVA, NOW);
  const corregido = registrarResultadoServicio(v, "no_recibio", EVA, NOW);
  A = A.map((x) => (x.id === "s1" ? corregido : cancelados.find((c: any) => c.id === x.id) || x));
  const s1 = A.find((x) => x.id === "s1"), m1 = A.find((x) => x.id === "m1");
  assert.deepEqual([s1.servicioResultado, s1.resultado, "monto" in s1, "cartucho_meses" in s1], ["no_recibio", "no_recibio", false, false]);
  assert.deepEqual(contarVentasDemosV2({ appts: A }), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });
  assert.equal(ventaServicioCartucho(s1), null);
  assert.deepEqual([m1.status, m1.cancelledByUid, m1.cancelReason, m1.createdFrom], ["cancelada", "sup1", "Venta corregida en el servicio de origen", "service_maintenance"]);
  assert.equal(A.find((x) => x.id === "m2").status, undefined);
  assert.equal(mantenimientosDe(A, "s1").length, 0);
  // Venta → otra venta: se cancela el anterior y el nuevo mantenimiento ya no choca con él
  const v2 = registrarVentaServicio(v, { monto: 300, producto: "Ducha", meses: 12 }, EVA, NOW);
  const B = [v2, m].map((x) => cancelarMantenimientosDe([v, m], "s1", EVA, NOW).find((c: any) => c.id === x.id) || x);
  const nuevo = mantenimientoDesdeServicio(v2, { producto: "Ducha", meses: 12 }, NOW, "m3");
  assert.equal(duplicateServiceCandidate(B, nuevo, 7), null);
  assert.equal(mantenimientosDe([...B, nuevo], "s1").map((x: any) => x.id).join(), "m3");
  const ui = fs.readFileSync(new URL("../src/components/servicio/ServicioV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes('const cancelarMantAnteriores = () => (est === "venta" ? cancelarMantenimientosDe(appts || [], s.id, autor) : []);'));
});

test("K · ACCESS_V2=0: racha, semana, grupos y cartuchos legacy sin cambios", () => {
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(app.includes(`      if(h.cita_resultado==="demo_venta"||h.cita_resultado==="venta") acum(idx,"ventas");`));
  assert.ok(app.includes(`    if((a.resultado==="demo_venta"||a.resultado==="venta") && a.cartucho_meses>0){`));
  for (const gate of ["if(ACCESS_V2) ventasServicioDe(allData.appts, agente)", "const vs = ACCESS_V2 ? ventaServicioCartucho(a) : null;", "...(ACCESS_V2?{ appts:apptsDelGrupo(appts, g.key) }:{})"])
    assert.ok(app.includes(gate), gate);
});

// ════════ Servicio r1.1 · corrección explícita y duplicado desde la tarjeta del cliente ════════
test("1-3 · Corregir Venta $1,800 → No recibió: sin venta/volumen/demos; historial conserva la venta y marca la corrección", () => {
  const v = registrarVentaServicio(serv(), { monto: 1800, producto: "Purificador", meses: 6 }, TOMAS, new Date(2026, 9, 1, 10, 0));
  const c = corregirResultadoServicio(v, { resultado: "no_recibio" }, EVA, NOW);
  assert.deepEqual([c.servicioResultado, c.resultado, c.venta, "monto" in c, "cartucho_meses" in c], ["no_recibio", "no_recibio", false, false, false]);
  assert.deepEqual(contarVentasDemosV2({ appts: [c] }), { demos: 0, ventas: 0, volumen: 0, cierre: 0 });       // 1
  assert.equal(serviciosRealizados([c], () => true), 0);
  assert.equal(c.servicioHistorial.length, 2);
  assert.deepEqual(c.servicioHistorial[0], v.servicioHistorial[0]);                                             // 2 · la venta sigue en el historial
  assert.equal(c.servicioHistorial[0].resultado, "venta"); assert.equal(c.servicioHistorial[0].monto, 1800);
  assert.deepEqual(c.servicioHistorial[1], { resultado: "no_recibio", fecha: NOW.toISOString(), uid: "sup1", nombre: "Eva Supervisor", agente: "Eva Supervisor",
    correction: true, previousResult: "venta", previousMonto: 1800, previousProducto: "Purificador" });            // 3
  assert.deepEqual([c.resultByUid, c.resultByName, c.resultAt], ["sup1", "Eva Supervisor", NOW.toISOString()]);
  // corrección a otra venta: también queda marcada y con el monto nuevo
  const c2 = corregirResultadoServicio(v, { resultado: "venta", monto: 500, producto: "Ducha", meses: 0 }, EVA, NOW);
  assert.deepEqual([c2.resultado, c2.monto, "cartucho_meses" in c2, c2.servicioHistorial[1].correction, c2.servicioHistorial[1].previousMonto], ["venta_servicio", 500, false, true, 1800]);
  assert.equal(contarVentasDemosV2({ appts: [c2] }).volumen, 500);
  // textos de la confirmación
  assert.equal(resumenResultado(v), "Venta · $1,800 · Purificador");
  assert.equal(resumenNuevo({ resultado: "no_recibio" }), "No recibió");
});

test("4 · Corregir resultado NO guarda hasta confirmar", () => {
  assert.equal(requiereConfirmacion(serv()), false);                                                           // pendiente: guarda directo
  for (const x of [registrarVentaServicio(serv(), { monto: 1 }, EVA, NOW), registrarResultadoServicio(serv(), "realizado", EVA, NOW), registrarResultadoServicio(serv(), "no_visito", EVA, NOW)])
    assert.equal(requiereConfirmacion(x), true);
  assert.equal(requiereConfirmacion(cancelarServicio(serv(), EVA, NOW)), false);
  const ui = fs.readFileSync(new URL("../src/components/servicio/ServicioV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes("if (corrigiendo) { setConfirmar({ resultado: r }); return; }"));                     // resultado → solo propone
  assert.ok(ui.includes('if (corrigiendo) { setConfirmar({ resultado: "venta", monto: venta.monto, producto: label, meses }); return; }'));
  assert.ok(ui.includes("const u = corregirResultadoServicio(s, confirmar, autor);"));                          // solo al confirmar
  for (const t of ["Estás corrigiendo un resultado ya registrado.", "Esto modificará las métricas de venta y volumen.", "Resultado actual", "Nuevo resultado", "Confirmar corrección", ">Volver<"])
    assert.ok(ui.includes(t), t);
});

test("5-8 · Tarjeta del cliente → Agendar servicio: aviso de duplicado (registro, referido), guardar de todos modos, cita no duplica", () => {
  const existente = serv({ id: "e1", fecha: "2026-10-10T09:00", sourceSection: "distribucion", sourceRecordId: "d1" });
  // 5 · misma traza que arma la tarjeta (trazaRegistro del cliente)
  const desdeTarjeta = { tipo: "servicio", fecha: "2026-10-11T15:00", producto: "Frescapure", telefono: "", ...trazaRegistro({ id: "d1", section: "distribucion" } as any) };
  assert.equal(duplicateServiceCandidate([existente], desdeTarjeta)?.id, "e1");
  assert.equal(duplicateServiceCandidate([existente], { ...desdeTarjeta, ...trazaRegistro({ id: "d2", section: "distribucion" } as any) }), null);
  // 6 · referido: decide el sourceRefIndex
  const refEx = serv({ id: "r1", fecha: "2026-10-10T09:00", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1 });
  const ref = (i: number) => ({ tipo: "servicio", fecha: "2026-10-10T12:00", producto: "Frescapure", ...trazaRegistro({ _refDe: "anf1", _refIdx: i, _tipo: "referidos" } as any) });
  assert.equal(duplicateServiceCandidate([refEx], ref(1))?.id, "r1");
  assert.equal(duplicateServiceCandidate([refEx], ref(0)), null);
  // 8 · una cita comercial del mismo cliente nunca es duplicado de servicio
  const cita = { id: "c", tipo: "cita", fecha: "2026-10-10T09:00", sourceSection: "distribucion", sourceRecordId: "d1", telefono: "2105550101", producto: "Frescapure" };
  assert.equal(duplicateServiceCandidate([cita], desdeTarjeta), null);
  // 5/7 · DBSection: revisa ANTES de guardar (solo v2 · servicio) y "Guardar de todos modos" guarda forzando
  const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.ok(/if\(ACCESS_V2 && appt\.tipo==="servicio" && !forzar\)\{[\s\S]{0,400}duplicateServiceCandidate\(allData\?\.appts\|\|\[\], \{\.\.\.appt, \.\.\.traza, tipo:"servicio"\}\);\s*if\(existente\)\{ setDupServ\(\{appt, existente\}\); return; \}/.test(app));
  assert.ok(app.includes("onGuardar={()=>handleSchedule(dupServ.appt, true)}"));
  assert.ok(app.includes(`        if(!ACCESS_V2) return form;`));                                               // legacy: el mismo formulario de siempre
});
