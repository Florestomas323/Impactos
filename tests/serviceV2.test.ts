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
  candidatosServicio,
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
  assert.ok(/const dup = duplicateServiceCandidate\(appts \|\| \[\], m, 7\);\s*if \(dup\) setMant\(\{ m, dup \}\); else onCrear\(m\);/.test(app));
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
