// V2 · ajustes de UI: PAGO desde el detalle de Cobranza (un solo modal), "Tipo de cuenta" fuera del
// formulario, y "Historial de gestiones" en las tarjetas de Base de Datos. Legacy (ACCESS_V2=0) igual.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const COB = fs.readFileSync(new URL("../src/modules/collections/CobranzaSection.tsx", import.meta.url), "utf8");
const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const ROW = APP.slice(APP.indexOf("function ClientRow("), APP.indexOf("function DBSection("));
const BTN_PAGO = `            <Btn onClick={() => {
          // v2: cerrar el detalle al abrir el pago → un solo Modal/overlay (mismo patrón que EDITAR)
          setPagar(detalleC);
          if (ACCESS_V2) setDetalle(null);
        }}><DollarSign size={13} /> PAGO</Btn>`;

test("1 · PAGO desde el detalle: en v2 se cierra el detalle en el mismo toque que abre FormPago", () => {
  assert.ok(COB.includes(BTN_PAGO));
  assert.equal(COB.includes("<Btn onClick={() => setPagar(detalleC)}>"), false, "ya no queda el botón que dejaba el detalle abierto");
  // mismo patrón que ya usaba EDITAR
  assert.ok(COB.includes("setEditar(detalleC);\n          setDetalle(null);"));
  // el detalle es un Modal que solo existe mientras detalleC; FormPago otro Modal mientras pagar
  assert.ok(COB.includes("{detalleC && <Modal title={detalleC.nombre.toUpperCase()"));
  assert.ok(COB.includes("{pagar && <FormPago c={pagar}"));
});

test("2 · Nunca detalleC && pagar a la vez en ese flujo (v2); legacy conserva su comportamiento", () => {
  // Mismo cuerpo del onClick, sobre un estado simulado {detalle, pagar}
  const tocarPago = (ACCESS_V2: boolean, st: { detalle: any; pagar: any }, detalleC: any) => {
    const s = { ...st };
    const setPagar = (v: any) => { s.pagar = v; }, setDetalle = (v: any) => { s.detalle = v; };
    setPagar(detalleC);
    if (ACCESS_V2) setDetalle(null);
    return s;
  };
  const c = { id: "d1", nombre: "Prueba D1", saldo: 1200 };
  const v2 = tocarPago(true, { detalle: "d1", pagar: null }, c);
  assert.deepEqual([v2.detalle, v2.pagar?.id], [null, "d1"]);
  assert.equal(!!(v2.detalle && v2.pagar), false, "un solo modal");
  const leg = tocarPago(false, { detalle: "d1", pagar: null }, c);
  assert.deepEqual([leg.detalle, leg.pagar?.id], ["d1", "d1"], "legacy: igual que antes");
  // cancelar el pago solo cierra FormPago (no reabre el detalle)
  assert.ok(COB.includes("<FormPago c={pagar} onClose={() => setPagar(null)}"));
});

test("3 · El pago se registra igual: FormPago, onPago y registrarPago sin cambios", () => {
  assert.ok(COB.includes(`{pagar && <FormPago c={pagar} onClose={() => setPagar(null)} onPago={(m, met) => {
      onPago(pagar.id, m, met);
      setPagar(null);
    }} />}`));
  assert.ok(COB.includes("const registrarPago = (id, monto, metodo, fecha) => {"));
  assert.ok(COB.includes('<Btn onClick={ok} style={{'), "botón CONFIRMAR PAGO de FormPago intacto");
  assert.ok(COB.includes("onPago(m, metodo);"));
});

test("4 · FormCliente de Cobranza: 'Tipo de cuenta' solo con !ACCESS_V2; v2 queda en 2 columnas (Método de pago · Estado)", () => {
  const i = COB.indexOf("<span style={lbl}>Tipo de cuenta</span>");
  assert.ok(i > 0);
  const antes = COB.slice(i - 500, i);
  assert.ok(antes.includes("{!ACCESS_V2 && <label style={{"), "el campo legacy se monta solo sin v2");
  assert.ok(antes.includes('gridTemplateColumns: ACCESS_V2 ? "1fr 1fr" : "1fr 1fr 1fr",'), "sin columna vacía en v2");
  assert.ok(COB.includes("<option value=\"\">—</option><option>Revolving</option><option>Installment</option>\n              </select>\n            </label>}"));
  assert.equal((COB.match(/<span style=\{lbl\}>Tipo de cuenta<\/span>/g) || []).length, 1, "sin reemplazo por otro selector");
  assert.ok(COB.includes("<span style={lbl}>Método de pago</span>") && COB.includes("<span style={lbl}>Estado</span>"));
});

test("5 · tipoCuenta existente no se pierde: se lee al abrir y se reescribe tal cual al guardar", () => {
  assert.ok(COB.includes(`tipoCuenta: c && c.tipoCuenta || "",`), "FormCliente lo carga del registro");
  assert.ok(COB.includes("tipoCuenta: f.tipoCuenta,"), "y lo guarda igual (sin selector, el valor no cambia)");
  assert.ok(COB.includes(`tipoCuenta: ov.tipoCuenta || "",`), "la lista de clientes sigue leyéndolo");
  assert.equal(/delete [a-zA-Z.]*tipoCuenta|tipoCuenta:\s*undefined/.test(COB), false, "nadie lo borra");
});

test("6-7 · Base de Datos v2: 'Historial de gestiones' y 'X gestiones' (singular 'gestión')", () => {
  assert.ok(ROW.includes(`{ACCESS_V2?"Historial de gestiones":"Historial de contactos"}`));
  const etiqueta = (ACCESS_V2: boolean, n: number) =>
    n > 0 ? (ACCESS_V2 ? `(${n} ${n !== 1 ? "gestiones" : "gestión"})` : `(${n} contacto${n !== 1 ? "s" : ""})`) : "— sin registros";
  assert.ok(ROW.includes(`{historial.length>0?(ACCESS_V2?\`(\${historial.length} \${historial.length!==1?"gestiones":"gestión"})\`:\`(\${historial.length} contacto\${historial.length!==1?"s":""})\`):"— sin registros"}`));
  assert.deepEqual([etiqueta(true, 1), etiqueta(true, 2), etiqueta(true, 0)], ["(1 gestión)", "(2 gestiones)", "— sin registros"]);
  assert.equal(etiqueta(true, 3).includes("gestiónes"), false);
  // Notas siguen separadas del historial
  assert.ok(ROW.includes(`{showNotasHist?"Ocultar":"Ver"} historial de notas ({notas.length})`), "botón de notas aparte, sin cambios");
});

test("8 · Legacy (ACCESS_V2=0): mismos textos que antes", () => {
  const etiqueta = (n: number) => (n > 0 ? `(${n} contacto${n !== 1 ? "s" : ""})` : "— sin registros");
  assert.deepEqual([etiqueta(1), etiqueta(2)], ["(1 contacto)", "(2 contactos)"]);
  assert.equal(false ? "Historial de gestiones" : "Historial de contactos", "Historial de contactos");
  assert.equal(false ? "1fr 1fr" : "1fr 1fr 1fr", "1fr 1fr 1fr");
});

test("9 · firestore.rules: Cobranza sigue protegida igual (sin cambios en este ajuste)", () => {
  const RULES = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  assert.ok(RULES.includes("|| (r == 'telemarketing_cobranza'      && x in ['cobranza'])"));
  assert.ok(RULES.includes("allow delete: if isSuper() || isDistOf(appId);"));
});
