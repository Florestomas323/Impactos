// Llamadas v2: Todos / Prioridad / Estados / Zonas y resumen de cartera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsDe, priorizar, filtrarItems, conteoEstados, opcionesZona, resumenCartera, sinFiltros, PAGINA, RESULTADOS, conteoResultados } from "../src/services/callWorkflow";

const NOW = new Date(2026, 8, 24, 11, 0, 0);
const HOY = "2026-09-24";
const CATALOGO = ["rojo", "verde", "amarillo", "azul", "naranja", "morado", "magenta", "buzon", "sin_estado", "numero_equivocado"];
let n = 0;
const reg = (x: any = {}) => ({ id: "r" + (++n), nombre: "Cliente " + n, telefono: "21455500" + String(n).padStart(2, "0"), ciudad: "Dallas", cp: "75217", estado: "sin_estado", assignedTo: "eva", historial: [], ...x });
const cartera = (regs: any[]) => itemsDe({ agregados: regs }, "ventas", "eva");
const prio = (items: any[]) => priorizar(items, "ventas", NOW);

test("1) 30 asignados, 20 califican → Todos 30, Prioridad 20 (sin tope), cartera 30", () => {
  const regs = [
    ...Array.from({ length: 20 }, () => reg()),                                  // nunca llamados → prioridad
    ...Array.from({ length: 5 }, () => reg({ estado: "verde" })),                // con cita
    ...Array.from({ length: 5 }, () => reg({ estado: "azul", proximo_seguimiento: "2026-10-15" })), // seguimiento futuro
  ];
  const items = cartera(regs), p = prio(items);
  assert.equal(items.length, 30);                                                 // Mi cartera y "Todos"
  assert.equal(p.length, 20);                                                     // Prioridad = prio.length, sin slice
  assert.equal(filtrarItems(items, {}).length, 30);                               // Todos sin filtros
  const r = resumenCartera(items, p, "ventas", NOW);
  assert.deepEqual({ p: r.prioridad, c: r.cita, s: r.seguimientoFuturo, total: r.total }, { p: 20, c: 5, s: 5, total: 30 });
  assert.equal(r.prioridad + r.cita + r.seguimientoFuturo + r.cerrado + r.invalido + r.sinDatos + r.otros, 30);   // nadie contado dos veces
});
test("2) 30 prioritarios → Prioridad 30 (y 45 → 45: no hay límite artificial)", () => {
  assert.equal(prio(cartera(Array.from({ length: 30 }, () => reg()))).length, 30);
  assert.equal(prio(cartera(Array.from({ length: 45 }, () => reg()))).length, 45);
});
test("3) Seguimiento futuro: en Todos sí, en Prioridad no", () => {
  const items = cartera([reg({ id: "fut", estado: "naranja", proximo_seguimiento: "2026-10-01" })]);
  assert.equal(filtrarItems(items, {}).length, 1);
  assert.equal(prio(items).length, 0);
  assert.equal(resumenCartera(items, prio(items), "ventas", NOW).seguimientoFuturo, 1);
});
test("4) Cita agendada: en Todos sí, en Prioridad no", () => {
  const items = cartera([reg({ id: "cita", estado: "verde" })]);
  assert.equal(filtrarItems(items, {}).length, 1);
  assert.equal(prio(items).length, 0);
  assert.equal(resumenCartera(items, prio(items), "ventas", NOW).cita, 1);
});
test("Resumen: precedencia sin duplicar (inválido y cerrado ganan a seguimiento futuro)", () => {
  const items = cartera([
    reg({ estado: "numero_equivocado", proximo_seguimiento: "2026-10-01" }),
    reg({ estado: "rojo", proximo_seguimiento: "2026-10-01" }),
    reg({ estado: "magenta" }),
    reg({ estado: "verde", proximo_seguimiento: "2026-10-01" }),
  ]);
  const r = resumenCartera(items, prio(items), "ventas", NOW);
  assert.deepEqual({ inv: r.invalido, cer: r.cerrado, cita: r.cita, fut: r.seguimientoFuturo }, { inv: 1, cer: 2, cita: 1, fut: 0 });
});

// Cartera con ciudades/ZIPs y estados variados
const mezcla = () => cartera([
  reg({ id: "a1", ciudad: "Austin", cp: "78701", estado: "azul" }),
  reg({ id: "a2", ciudad: "Austin", cp: "78701", estado: "morado" }),
  reg({ id: "a3", ciudad: "Austin", cp: "78704", estado: "azul" }),
  reg({ id: "a4", ciudad: "austin ", cp: "78745-1234", estado: "sin_estado" }),   // misma ciudad escrita distinto
  reg({ id: "d1", ciudad: "Dallas", cp: "75217", estado: "azul" }),
  reg({ id: "d2", ciudad: "Dallas", cp: "75216", estado: "naranja", ultimoResultado: "no_contesto" }),
  reg({ id: "g1", ciudad: "Garland", cp: "75040", estado: "morado", ultimoResultado: "en_proceso" }),
]);
const ids = (xs: any[]) => xs.map((x) => x.recId).sort();

test("5) Estado azul → solo azul", () => assert.deepEqual(ids(filtrarItems(mezcla(), { estados: ["azul"] })), ["a1", "a3", "d1"]));
test("6) Azul + morado → la unión", () => assert.deepEqual(ids(filtrarItems(mezcla(), { estados: ["azul", "morado"] })), ["a1", "a2", "a3", "d1", "g1"]));
test("7) Austin → solo Austin (agrupa 'austin ' con 'Austin')", () => assert.deepEqual(ids(filtrarItems(mezcla(), { ciudades: ["austin"] })), ["a1", "a2", "a3", "a4"]));
test("8) ZIP 78701 → solo ese ZIP", () => assert.deepEqual(ids(filtrarItems(mezcla(), { zips: ["78701"] })), ["a1", "a2"]));
test("9) Austin + 78701 → intersección; + 78704 → ambos ZIP; otra ciudad elegida va completa", () => {
  assert.deepEqual(ids(filtrarItems(mezcla(), { ciudades: ["austin"], zips: ["78701"] })), ["a1", "a2"]);
  assert.deepEqual(ids(filtrarItems(mezcla(), { ciudades: ["austin"], zips: ["78701", "78704"] })), ["a1", "a2", "a3"]);
  assert.deepEqual(ids(filtrarItems(mezcla(), { ciudades: ["austin", "dallas"], zips: ["78701"] })), ["a1", "a2", "d1", "d2"]);
});
test("10) Estado + Ciudad + ZIP → intersección (y el buscador también combina)", () => {
  assert.deepEqual(ids(filtrarItems(mezcla(), { estados: ["azul"], ciudades: ["austin"], zips: ["78701"] })), ["a1"]);
  assert.deepEqual(ids(filtrarItems(mezcla(), { estados: ["azul"], ciudades: ["austin"] })), ["a1", "a3"]);
  const conNombre = filtrarItems(mezcla(), { estados: ["azul"], q: "Cliente" });
  assert.equal(conNombre.length, 3);
  assert.deepEqual(ids(filtrarItems(mezcla(), { resultados: ["en_proceso"] })), ["g1"]);                 // último resultado ≠ estado
  assert.deepEqual(ids(filtrarItems(mezcla(), { estados: ["morado"], resultados: ["en_proceso"] })), ["g1"]);
});
test("11) Limpiar filtros → vuelve a Todos", () => {
  const items = mezcla();
  const vacio = { q: "", estados: [], resultados: [], ciudades: [], zips: [] };
  assert.ok(sinFiltros(vacio));
  assert.equal(filtrarItems(items, vacio).length, items.length);
  assert.ok(!sinFiltros({ estados: ["azul"] }));
});
test("12) Grupo de 50 → primeros 40, Ver más → los 50", () => {
  const items = cartera(Array.from({ length: 50 }, () => reg({ estado: "azul" })));
  const sel = filtrarItems(items, { estados: ["azul"] });
  assert.equal(sel.length, 50);
  let ver = PAGINA;
  assert.equal(sel.slice(0, ver).length, 40); assert.equal(sel.length - ver, 10);   // "Ver más (10)"
  ver += PAGINA;
  assert.equal(sel.slice(0, ver).length, 50);                                         // nada queda oculto
});
test("13) Ningún filtro ni selector muestra registros de otro assignedTo", () => {
  const regs = [reg({ id: "mio", ciudad: "Austin", cp: "78701", estado: "azul" }), reg({ id: "ajeno", assignedTo: "otra", ciudad: "Waco", cp: "76701", estado: "azul" })];
  const items = itemsDe({ agregados: regs, cobranza: { clientesData: { c1: { assignedTo: "eva", nombre: "Cuenta", ciudad: "Waco" } } }, reclutamiento: [{ id: "rc", assignedTo: "eva", ciudad: "Waco" }] }, "ventas", "eva");
  assert.deepEqual(ids(items), ["mio"]);
  for (const f of [{}, { estados: ["azul"] }, { ciudades: ["waco"] }, { zips: ["76701"] }, { q: "Cliente" }]) assert.ok(!ids(filtrarItems(items, f)).includes("ajeno"));
  assert.deepEqual(opcionesZona(items).map((z) => z.nombre), ["Austin"]);                 // Waco (ajeno/cobranza/reclutamiento) no aparece
  assert.equal(conteoEstados(items, CATALOGO).find((e) => e.id === "azul")!.n, 1);
});
test("Selectores: todos los estados del catálogo (incluye los de 0) y ZIPs por ciudad", () => {
  const e = conteoEstados(mezcla(), CATALOGO);
  assert.deepEqual(e.map((x) => x.id), CATALOGO);
  assert.equal(e.find((x) => x.id === "rojo")!.n, 0);
  assert.equal(e.find((x) => x.id === "azul")!.n, 3);
  const z = opcionesZona(mezcla());
  const austin = z.find((x) => x.clave === "austin")!;
  assert.equal(austin.n, 4); assert.equal(austin.nombre, "Austin");
  assert.deepEqual(austin.zips, [{ zip: "78701", n: 2 }, { zip: "78704", n: 1 }, { zip: "78745", n: 1 }]);
  assert.deepEqual(conteoResultados(mezcla(), "ventas").map((r) => r.id), RESULTADOS.ventas.map((r) => r.id));
});
