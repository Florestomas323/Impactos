// Servicio r1.2: historial visible (reprogramar / cancelar), Cartuchos (tiempo humano, alertas
// ≤15 días, ciclo desde el último cambio) y Venta → Distribución. TZ Texas.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  reprogramarServicio, cancelarServicio, registrarVentaServicio, registrarResultadoServicio, tiempoHumano, textoCambio,
  alertasCartucho, ultimoCambioCartucho, tieneServicioAgendado, servicioDesdeCartucho, contarVentasDemosV2,
} from "../src/services/serviceV2";
import { distribucionDesdeVenta, reconciliarDistribucionPorVenta, esVentaParaDistribucion, buscarEnDistribucion, idDistribucionDeVenta } from "../src/services/ventaDistribucionV2";
import { diffState, emptyDocs } from "../src/data/storeCore";

const TOMAS = { uid: "dist1", nombre: "Tomas" };
const NOW = new Date(2026, 9, 1, 23, 21, 0);                     // 1-oct 11:21 PM Texas (04:21 UTC del 2-oct)
const serv = (x: any = {}) => ({ id: "s1", tipo: "servicio", _type: "servicio", nombre: "Ana Pérez", telefono: "(210) 555-0101", producto: "Ducha",
  fecha: "2026-10-01T23:21", sourceSection: "distribucion", sourceRecordId: "d1", ...x });
const UI = fs.readFileSync(new URL("../src/components/servicio/ServicioV2.tsx", import.meta.url), "utf8");
const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("A · Reprogramar: misma cita; historial con fecha anterior, nueva, usuario y momento; visible en la tarjeta", () => {
  const r = reprogramarServicio(serv(), "2026-10-24T23:21", TOMAS, NOW);
  assert.equal(r.id, "s1");
  assert.deepEqual(r.reprogramHistory[0], { previousDate: "2026-10-01T23:21", newDate: "2026-10-24T23:21", changedAt: NOW.toISOString(), changedByUid: "dist1", changedByName: "Tomas", reason: "before_visit" });
  assert.ok(UI.includes("<b>Reprogramado:</b> {cuando(h.previousDate) || \"sin fecha\"} → {cuando(h.newDate)}{h.changedByName ? ` · ${h.changedByName}` : \"\"}"));
  assert.ok(UI.includes("{h.changedAt ? <span className=\"text-slate-400\"> ({cuando(h.changedAt)})</span> : null}"));
});

test("B · Cancelar: cancelledAt/ByUid/ByName/Reason guardados y visibles (Cancelado · fecha · quién · Motivo)", () => {
  const c = cancelarServicio(serv(), TOMAS, NOW, "Cliente de viaje");
  assert.deepEqual([c.status, c.cancelledAt, c.cancelledByUid, c.cancelledByName, c.cancelReason], ["cancelada", NOW.toISOString(), "dist1", "Tomas", "Cliente de viaje"]);
  assert.ok(UI.includes("<div><b>Cancelado</b>{s.cancelledAt ? ` · ${cuando(s.cancelledAt)}` : \"\"}{s.cancelledByName ? ` · ${s.cancelledByName}` : \"\"}</div>"));
  assert.ok(UI.includes("{s.cancelReason ? <div>Motivo: {s.cancelReason}</div> : null}"));
});

test("C1 · Tiempo humano (días · meses · años y meses · vencido)", () => {
  const casos: Array<[number, string]> = [[730, "En 2 años"], [548, "En 1 año y 6 meses"], [213, "En 7 meses"], [182, "En 6 meses"], [31, "En 1 mes"],
    [365, "En 12 meses"], [30, "En 30 días"], [24, "En 24 días"], [15, "En 15 días"], [1, "En 1 día"], [0, "Hoy"], [-8, "Vencido hace 8 días"],
    [-1, "Vencido hace 1 día"], [-60, "Vencido hace 2 meses"], [-400, "Vencido hace 1 año y 1 mes"], [1095, "En 3 años"]];
  for (const [d, t] of casos) assert.equal(tiempoHumano(d), t, String(d));
  assert.equal(textoCambio(15), "Requiere cambio en 15 días");
  assert.equal(textoCambio(0), "Requiere cambio hoy");
  assert.equal(textoCambio(-3), "Cambio vencido hace 3 días");
  assert.ok(APP.includes("{v2 ? tiempoHumano(x.diasFaltan) : <>En {x.diasFaltan} día(s)</>}"));                 // legacy: el texto de siempre
});

test("C2 · Alerta a 15 días o menos (y vencidos); se mantiene hasta agendar/reprogramar; no antes de 15 días", () => {
  const item = (dias: number, x: any = {}) => ({ nombre: "Tomas", telefono: "2105550101", producto: "Ducha", diasFaltan: dias, sourceSection: "distribucion", sourceRecordId: "d1", ...x });
  const a = alertasCartucho([item(15), item(16, { producto: "Filtro" }), item(-4, { sourceRecordId: "d2", telefono: "2105550202", nombre: "Eva" })], []);
  assert.deepEqual(a.map((x: any) => x.detalle), ["Tomas — Ducha · Requiere cambio en 15 días", "Eva — Ducha · Cambio vencido hace 4 días"]);
  assert.equal(a[0].titulo, "Cambio de cartucho próximo"); assert.equal(a[0].tipo, "cartucho");
  // se mantiene: sigue mientras no haya servicio agendado; al agendar (o reprogramar) desaparece
  const agendado = servicioDesdeCartucho({ ...item(10), proxFecha: new Date(2026, 9, 11) }, NOW, "n1");
  assert.equal(tieneServicioAgendado([agendado], item(10)), true);
  assert.equal(alertasCartucho([item(10)], [agendado]).length, 0);
  const reprogramado = reprogramarServicio(agendado, "2026-10-20T10:00", TOMAS, NOW);
  assert.equal(alertasCartucho([item(10)], [reprogramado]).length, 0);
  // un servicio cancelado NO cuenta como agendado → la alerta vuelve
  assert.equal(alertasCartucho([item(10)], [cancelarServicio(agendado, TOMAS, NOW)]).length, 1);
  // otro producto del mismo cliente no apaga la alerta
  assert.equal(alertasCartucho([item(10)], [{ ...agendado, producto: "Filtro de agua" }]).length, 1);
  // App.tsx: solo v2, solo quien ve Servicio, en el panel y en el contador; clic → Servicio
  assert.ok(APP.includes(`if(!ACCESS_V2 || !v2User || !canTab("servicio")) return [];`));
  assert.ok(APP.includes("notifs={ACCESS_V2&&alertasCart.length?[...alertasCart,...notifs]:notifs}"));
  assert.ok(APP.includes(`else if(ACCESS_V2 && n.tipo==="cartucho") destino="servicio";`));
});

test("C3 · Registrar el cambio reinicia el ciclo desde esa fecha (por cliente y producto)", () => {
  const item = { nombre: "Tomas", telefono: "2105550101", producto: "Ducha", sourceSection: "distribucion", sourceRecordId: "d1" };
  const hecho = registrarResultadoServicio(serv({ id: "c1", producto: "Ducha" }), "realizado", TOMAS, new Date(2026, 8, 20, 21, 30));   // 20-sep 9:30 PM
  assert.equal(ultimoCambioCartucho([hecho], item, "2026-03-01T10:00"), "2026-09-20T21:30");                      // fecha local
  assert.equal(ultimoCambioCartucho([hecho], item, "2026-09-25T10:00"), null);                                    // anterior a la venta: no aplica
  assert.equal(ultimoCambioCartucho([{ ...hecho, producto: "Filtro" }], item, "2026-03-01"), null);                // otro producto
  assert.equal(ultimoCambioCartucho([{ ...hecho, sourceRecordId: "d9" }], item, "2026-03-01"), null);             // otro cliente
  assert.equal(ultimoCambioCartucho([reprogramarServicio(serv(), "2026-10-30T10:00", TOMAS, NOW)], item, "2026-03-01"), null);   // pendiente ≠ cambio
  assert.ok(APP.includes("const cambio = ACCESS_V2 ? ultimoCambioCartucho(appts, { nombre, telefono, producto:prodLabel, ...extra }, fechaVentaOriginal) : null;"));
});

test("D1 · Venta → Distribución: cita demo_venta y servicio venta_servicio crean el registro con datos y trazabilidad", () => {
  const cita = { id: "c7", tipo: "cita", resultado: "demo_venta", monto: 2500, producto: "Sartenes", fecha: "2026-10-01T18:00", nombre: "Beto", telefono: "2105550303",
    direccion: "9 Oak", ciudad: "Waco", cp: "76701", cuenta: "RP-77", sourceSection: "agregados", sourceRecordId: "a1", createdByUid: "tlk1", createdByName: "Liam", resultByUid: "dist1", resultByName: "Tomas" };
  const r = distribucionDesdeVenta([], cita, NOW);
  assert.equal(r.accion, "creado");
  const d = r.lista[0];
  assert.deepEqual([d.id, d.nombre, d.telefono, d.direccion, d.ciudad, d.cp, d.cuenta], ["dv_c7", "Beto", "2105550303", "9 Oak", "Waco", "76701", "RP-77"]);
  assert.deepEqual([d.sourceSection, d.sourceRecordId, d.createdByUid, d.createdByName, d.createdFrom, d.ventaOrigenApptId], ["agregados", "a1", "tlk1", "Liam", "venta_distribucion", "c7"]);
  assert.deepEqual(d.ventasOrigen, [{ apptId: "c7", tipo: "cita", resultado: "demo_venta", fecha: "2026-10-01T18:00", monto: 2500, producto: "Sartenes", porUid: "dist1", porNombre: "Tomas" }]);
  // referido: conserva índice
  const ref = distribucionDesdeVenta([], { ...cita, id: "c8", telefono: "2105550404", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 2 }, NOW).lista[0];
  assert.deepEqual([ref.sourceSection, ref.sourceRecordId, ref.sourceRefIndex], ["referidos", "anf1", 2]);
  // servicio con venta
  const vs = registrarVentaServicio(serv({ id: "s9", sourceSection: "prospectos", sourceRecordId: "p1", telefono: "2105550505" }), { monto: 900, producto: "Ducha" }, TOMAS, NOW);
  const rs = distribucionDesdeVenta([], vs, NOW);
  assert.equal(rs.accion, "creado"); assert.equal(rs.lista[0].ventasOrigen[0].tipo, "servicio"); assert.equal(rs.lista[0].fuente, "Venta en servicio");
  // el registro de Distribución NO duplica la venta en las métricas (historial vacío)
  assert.deepEqual(contarVentasDemosV2({ appts: [{ ...cita, _sincronizado: true }], clientes: [{ historial: [{ cita_resultado: "demo_venta", fecha: "2026-10-01", monto: 2500 }] }, d] }), { demos: 1, ventas: 1, volumen: 2500, cierre: 100 });
});

test("D2 · Anti-duplicado: si ya está en Distribución no se crea otro; solo se completan datos vacíos", () => {
  const base = { id: "c7", tipo: "cita", resultado: "demo_venta", fecha: "2026-10-01T18:00", nombre: "Beto Nuevo", telefono: "(210) 555-0303", direccion: "Calle nueva", ciudad: "Waco", cuenta: "RP-77", sourceSection: "agregados", sourceRecordId: "a1" };
  // por teléfono
  const dist = [{ id: "D1", nombre: "Beto", telefono: "210-555-0303", direccion: "", ciudad: "Temple", historial: [] }];
  const r = distribucionDesdeVenta(dist, base, NOW);
  assert.equal(r.accion, "actualizado"); assert.equal(r.lista.length, 1);
  assert.deepEqual([r.lista[0].nombre, r.lista[0].direccion, r.lista[0].ciudad, r.lista[0].cuenta], ["Beto", "Calle nueva", "Temple", "RP-77"]);   // no pisa datos válidos
  // la misma venta otra vez → sin cambios (idempotente)
  assert.equal(distribucionDesdeVenta(r.lista, base, NOW).accion, "sin_cambios");
  // por registro de origen ya vinculado, por cuenta, por id determinista y cuando la venta ES de Distribución
  assert.equal(buscarEnDistribucion([{ id: "X", sourceSection: "agregados", sourceRecordId: "a1" }], { ...base, telefono: "" })?.id, "X");
  assert.equal(buscarEnDistribucion([{ id: "Y", cuenta: "RP-77" }], { ...base, telefono: "", sourceRecordId: undefined })?.id, "Y");
  assert.equal(buscarEnDistribucion([{ id: idDistribucionDeVenta(base) }], { ...base, telefono: "", sourceRecordId: undefined, cuenta: "" })?.id, "dv_c7");
  const r2 = distribucionDesdeVenta([{ id: "d1", nombre: "Ana", telefono: "1" }], { ...base, sourceSection: "distribucion", sourceRecordId: "d1", telefono: "" }, NOW);
  assert.deepEqual([r2.accion, r2.lista.length, r2.lista[0].ventasOrigen.length], ["actualizado", 1, 1]);
  // los eliminados (papelera) no cuentan como existentes
  assert.equal(buscarEnDistribucion([{ id: "Z", telefono: "2105550303", eliminado: true }], base), null);
});

test("D3 · No pasan a Distribución: demo_no_venta, no_recibio, no_visito, seguimiento ni cancelados", () => {
  const c = (resultado: string, x: any = {}) => ({ id: "c", tipo: "cita", resultado, telefono: "2105550101", ...x });
  for (const r of ["demo_no_venta", "no_recibio", "no_visito", "seguimiento", "no_venta", "reprogramada_visita"])
    assert.equal(distribucionDesdeVenta([], c(r), NOW).accion, "omitido", r);
  assert.equal(esVentaParaDistribucion(c("demo_venta", { status: "cancelada" })), false);
  assert.equal(esVentaParaDistribucion(registrarResultadoServicio(serv(), "realizado", TOMAS, NOW)), false);
  assert.equal(esVentaParaDistribucion(registrarResultadoServicio(serv(), "no_recibio", TOMAS, NOW)), false);
  assert.equal(esVentaParaDistribucion(c("venta")), true);                                                    // legacy venta
});

test("D4 · Store: el registro nuevo conserva createdByUid original (solo staff, solo al crear, solo venta_distribucion)", () => {
  const nuevo = distribucionDesdeVenta([], { id: "c7", tipo: "cita", resultado: "demo_venta", nombre: "Beto", telefono: "2105550303", createdByUid: "tlk1", createdByName: "Liam" }, NOW).lista[0];
  const staff = { uid: "dist1", role: "distribuidor", appId: "impactos", nombre: "Tomas" };
  const op: any = diffState({ distribucion: [] }, { distribucion: [nuevo] }, emptyDocs(), staff).ops[0];
  assert.deepEqual([op.col, op.id, op.data.section, op.data.createdByUid, op.data.createdByName, op.data.assignedTo], ["records", "dv_c7", "distribucion", "tlk1", "Liam", null]);
  // un registro normal sigue tomando a quien lo crea
  const normal: any = diffState({ distribucion: [] }, { distribucion: [{ id: "n1", nombre: "X", createdByUid: "otro" }] }, emptyDocs(), staff).ops[0];
  assert.equal(normal.data.createdByUid, "dist1");
  // App: citas vía sincronizarVentaAgenda (misma actualización) y servicios vía onVenta; solo v2 y staff
  assert.ok(APP.includes("if(!ACCESS_V2 || !v2User || !canRecordVisitResult(v2User.role)) return st;"));
  assert.ok(APP.includes("})(s0); return conDistribucionV2(out, appt); });"));
  assert.ok(UI.includes("if (onVenta) onVenta(u);"));
});


test("E · Corregir venta (Base de Datos r1): auto-creado sin trabajo → PAPELERA (nunca borrado); trabajado o preexistente → se desvincula y sigue activo", () => {
  const venta = registrarVentaServicio(serv({ id: "sVenta", sourceSection: "prospectos", sourceRecordId: "p1" }),
    { monto: 500, producto: "Ducha" }, TOMAS, NOW);
  const creado = distribucionDesdeVenta([], venta, NOW);
  assert.equal(creado.accion, "creado");
  assert.equal(creado.lista.length, 1);

  const corregido = registrarResultadoServicio(venta, "no_recibio", TOMAS, new Date(NOW.getTime() + 60000));
  const t2 = new Date(NOW.getTime() + 120000);
  // A · auto-creado y nunca trabajado → papelera con motivo, fecha y quién; NO sale de la lista
  const papelera = reconciliarDistribucionPorVenta(creado.lista, corregido, t2, { uid: "sup1", nombre: "Eva Supervisor" });
  assert.equal(papelera.accion, "papelera");
  assert.equal(papelera.lista.length, 1);                                           // nunca "retirado"/delete
  const r = papelera.lista[0];
  assert.deepEqual([r.eliminado, r.eliminadoMotivo, r.eliminadoAt, r.eliminadoPorUid, r.eliminadoPorNombre, r.ventasOrigen, "ventaOrigenApptId" in r],
    [true, "Venta corregida", t2.toISOString(), "sup1", "Eva Supervisor", [], false]);
  assert.equal(r.createdFrom, "venta_distribucion"); assert.equal(r.sourceRecordId, "p1");   // trazabilidad intacta

  // C · preexistente → solo se quita la referencia; sigue activo
  const existente = [{ id: "d1", nombre: "Ana Pérez", telefono: "2105550101", ventasOrigen: [{ apptId: "sVenta", tipo: "servicio" }] }];
  const desvinculado = reconciliarDistribucionPorVenta(existente, corregido, t2, { uid: "sup1", nombre: "Eva" });
  assert.equal(desvinculado.accion, "desvinculado");
  assert.deepEqual([desvinculado.lista.length, desvinculado.lista[0].eliminado, desvinculado.lista[0].ventasOrigen], [1, undefined, []]);

  // B · auto-creado pero con otra venta → sigue activo, se quita solo esa referencia
  const conOtraVenta = [{ ...creado.lista[0], ventasOrigen: [...creado.lista[0].ventasOrigen, { apptId: "otra", tipo: "cita" }] }];
  const conserva = reconciliarDistribucionPorVenta(conOtraVenta, corregido, t2);
  assert.equal(conserva.accion, "desvinculado");
  assert.deepEqual([conserva.lista.length, conserva.lista[0].eliminado, conserva.lista[0].ventasOrigen.map((x: any) => x.apptId)], [1, undefined, ["otra"]]);
});
