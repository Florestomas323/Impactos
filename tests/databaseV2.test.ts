// Base de Datos v2 r1: paginación, búsqueda/filtros, duplicados con motivo (aviso), acciones por rol,
// reconciliación Venta → Distribución sin borrado físico, venta desde la tarjeta del cliente, clave estable.
process.env.TZ = "America/Chicago";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  paginar, PAGINA_DB, filtrarRegistros, coincideBusquedaV2, candidatoDuplicado, candidatosDuplicadoAnfitrion, textoDuplicado,
  accionesRegistroV2, ventaDesdeRegistro, normTelefono, normCuenta, normTexto, telefonosDe, camposVenta, clavesReferidos, correccionDesdeRegistro,
} from "../src/services/databaseV2";
import { distribucionDesdeVenta, reconciliarDistribucionPorVenta, registroTrabajado, esVentaParaDistribucion } from "../src/services/ventaDistribucionV2";
import { registrarVentaServicio, registrarResultadoServicio, contarVentasDemosV2 } from "../src/services/serviceV2";
import { can } from "../src/auth/permissions";
import { diffState, emptyDocs } from "../src/data/storeCore";

const NOW = new Date(2026, 9, 2, 10, 0, 0);
const U = (role: string, uid = "u1") => ({ uid, role, status: "active", appId: "impactos" } as any);
const actor = (role: string, uid = "u1") => ({ uid, role, can: (p: string) => can(U(role, uid), p) });
const reg = (i: number, x: any = {}) => ({ id: "r" + i, nombre: "Cliente " + i, telefono: "210555" + String(1000 + i), ciudad: i % 2 ? "Temple" : "Waco", estado: i % 3 ? "pendiente" : "contactado", ...x });
const muchos = Array.from({ length: 75 }, (_, i) => reg(i));
const APP = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("1-2 · Paginación: 30 iniciales; 'Ver más' suma 30; nunca pasa del total", () => {
  assert.equal(PAGINA_DB, 30);
  const p1 = paginar(muchos, PAGINA_DB);
  assert.deepEqual([p1.items.length, p1.total, p1.visibles, p1.hayMas, p1.restantes], [30, 75, 30, true, 45]);
  const p2 = paginar(muchos, PAGINA_DB * 2);
  assert.deepEqual([p2.items.length, p2.hayMas], [60, true]);
  const p3 = paginar(muchos, PAGINA_DB * 3);
  assert.deepEqual([p3.items.length, p3.visibles, p3.hayMas, p3.restantes], [75, 75, false, 0]);
  assert.equal(paginar([], 30).total, 0);
  // DBSection (App.tsx): se pagina SOLO en v2, "Ver más" suma la página y los filtros reinician las visibles
  assert.ok(APP.includes("const pagV2 = v2 ? paginarDB(filtered, visiblesV2) : null;"));
  assert.ok(APP.includes("const listaRender = v2 ? pagV2.items : filtered;"));
  assert.ok(APP.includes("onMas={()=>setVisiblesV2(n=>n+(v2.pagina||30))}"));
  assert.ok(APP.includes("useEffect(()=>{ setVisiblesV2(v2?.pagina||30); },[search, filterStatus, filterCity, filterCP, showPapelera, type, v2?.pagina]);"));
});

test("3-4 · Filtros y búsqueda se aplican ANTES de paginar; el contador es el total filtrado", () => {
  const temple = filtrarRegistros(muchos, { filterCity: "temple" });
  assert.equal(temple.length, 37);
  const p = paginar(temple, 30);
  assert.deepEqual([p.items.length, p.total], [30, 37]);                       // 4 · total filtrado, no solo lo visible
  assert.ok(p.items.every((c: any) => c.ciudad === "Temple"));
  // papelera: solo eliminados; normal: sin eliminados
  const conPapelera = [...muchos, reg(900, { eliminado: true })];
  assert.equal(filtrarRegistros(conPapelera, {}).length, 75);
  assert.equal(filtrarRegistros(conPapelera, { papelera: true }).length, 1);
  // búsqueda: acentos, cuenta, referidos anidados, teléfono numérico, ZIP incompleto
  const c = { nombre: "José Pérez", telefono: "(210) 555-0101", telefonoMovil: "254-555-9999", cuenta: "RP-77", cp: "76501", ciudad: "Temple", direccion: "9 Oak" };
  assert.ok(coincideBusquedaV2(c, { search: "jose perez" }));
  assert.ok(coincideBusquedaV2(c, { search: "RP-77" }));                          // cuenta
  assert.ok(coincideBusquedaV2(c, { search: "5559999" }));                        // variante de teléfono
  assert.equal(coincideBusquedaV2(c, { search: "calle 5" }), false);              // texto con un dígito no busca teléfono
  assert.equal(coincideBusquedaV2(c, { filterCP: "765" }), false);                // ZIP incompleto: nada (igual que legacy)
  assert.ok(coincideBusquedaV2(c, { filterCP: "76501" }));
  const anf = { anfitrion: "Rita", anfitrion_telefono: "2105550000", referidos: [{ nombre: "Marta López", telefono: "2105550303" }] };
  assert.ok(coincideBusquedaV2(anf, { search: "marta" }));                        // referido anidado
  assert.ok(coincideBusquedaV2(anf, { search: "5550303" }));
  assert.ok(APP.includes("return v2 ? coincideBusquedaV2(c, {search, filterStatus, filterCity, filterCP}) : coincideBusqueda(c, {search, filterStatus, filterCity, filterCP});"));
});

test("5-9 · Duplicado como AVISO con motivo real: cuenta, teléfono, origen, nombre+dirección (débil)", () => {
  const allData = {
    agregados: [{ id: "a1", nombre: "Ana Pérez", telefono: "210-555-0101", cuenta: "RP-77", direccion: "123 Main St" }, { id: "a2", nombre: "Borrado", telefono: "2105550202", eliminado: true }],
    prospectos: [{ id: "p1", nombre: "Beto", telefono: "2105550404", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1 }],
    distribucion: [], referidos: [],
  };
  const d1 = candidatoDuplicado({ nombre: "Otra", telefono: "1", cuenta: "rp 77" }, allData)!;
  assert.deepEqual([d1.motivo, d1.existente.id, d1.seccion, d1.fuerte], ["cuenta", "a1", "agregados", true]);         // 5
  const d2 = candidatoDuplicado({ nombre: "Otra", telefono: "(210) 555 0101" }, allData)!;
  assert.deepEqual([d2.motivo, d2.existente.id], ["telefono", "a1"]);                                                  // 6
  const d3 = candidatoDuplicado({ nombre: "X", telefono: "9", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 1 }, allData)!;
  assert.deepEqual([d3.motivo, d3.existente.id], ["origen", "p1"]);                                                    // 7
  assert.equal(candidatoDuplicado({ nombre: "X", telefono: "9", sourceSection: "referidos", sourceRecordId: "anf1", sourceRefIndex: 0 }, allData), null);
  const d4 = candidatoDuplicado({ nombre: "ana perez", telefono: "9", direccion: "123 main st." }, allData)!;
  assert.deepEqual([d4.motivo, d4.fuerte], ["nombre_direccion", false]);                                             // 8 · débil
  assert.equal(candidatoDuplicado({ nombre: "ana perez", telefono: "9" }, allData), null);                             // nombre solo: NO
  assert.equal(candidatoDuplicado({ nombre: "Z", telefono: "2105550202" }, allData), null);                            // eliminados no cuentan
  // 9 · el texto dice el motivo real (no siempre "teléfono")
  assert.ok(textoDuplicado(d1).includes("el mismo número de cuenta") && textoDuplicado(d1).includes("Agregados"));
  assert.ok(textoDuplicado(d2).includes("el mismo teléfono"));
  assert.ok(textoDuplicado(d3).includes("el mismo registro de origen") && textoDuplicado(d3).includes("Prospección"));
  assert.ok(textoDuplicado(d4).includes("coincidencia débil"));
  // edición: se excluye el propio registro
  assert.equal(candidatoDuplicado({ nombre: "Ana Pérez", telefono: "2105550101", cuenta: "RP-77" }, allData, { excluirId: "a1" }), null);
});

test("10 · 'Guardar de todos modos' sigue permitido (aviso, nunca bloqueo ni fusión); legacy intacto", () => {
  assert.ok(APP.includes("const saveNew=(d, forzar=false)=>{"));
  assert.ok(APP.includes("if(v2 && !forzar && allData){"));
  assert.ok(APP.includes("onGuardar={()=>saveNew(dupV2.d, true)}"));
  assert.ok(APP.includes(`if(!v2 && type!=="referido" && allData && isDuplicate(d, allData)){`));   // legacy: findDuplicate de siempre
  assert.ok(APP.includes("function findDuplicate(contact, allData, excludeId=null) {"));
  const ui = fs.readFileSync(new URL("../src/components/database/DatabaseV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes("No se fusiona ni se borra nada") && ui.includes(">Volver<") && ui.includes(">Guardar de todos modos<"));
});

test("11 · Referidos incluidos: anfitrión y referidos anidados, al dar de alta y como existentes", () => {
  const allData = { agregados: [{ id: "a1", nombre: "Ana", telefono: "2105550101" }], prospectos: [], distribucion: [],
    referidos: [{ id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2105550000", referidos: [{ nombre: "Marta", telefono: "2105550303" }] }] };
  // alta de anfitrión con un referido que ya existe como agregado y otro que ya es referido de otro anfitrión
  const dups = candidatosDuplicadoAnfitrion({ anfitrion: "Rita Dos", anfitrion_telefono: "2105550000", referidos: [{ nombre: "X", telefono: "2105550101" }, { nombre: "Y", telefono: "2105550303" }] }, allData);
  assert.deepEqual(dups.map((d) => [d.motivo, d.seccion, d.existente.nombre || d.existente.anfitrion, !!d.referidoDe]),
    [["telefono", "referidos", "Rita", false], ["telefono", "agregados", "Ana", false], ["telefono", "referidos", "Marta", true]]);
  assert.ok(textoDuplicado(dups[2]).includes("referido de Rita"));
  // un agregado nuevo que ya es referido anidado también avisa
  assert.equal(candidatoDuplicado({ nombre: "Marta L", telefono: "2105550303" }, allData)!.referidoDe.id, "anf1");
  // editar el propio anfitrión no se marca contra sí mismo ni contra sus referidos
  assert.equal(candidatosDuplicadoAnfitrion(allData.referidos[0], allData, { excluirId: "anf1" }).length, 0);
  assert.ok(APP.includes('const dups = type==="referido" ? candidatosDuplicadoAnfitrion(d, allData, {excluirId})'));
});

test("12-15 · Acciones por rol: borrado definitivo solo super_admin y distribuidor; supervisor y telemarketing NO; editar según permisos", () => {
  const r = { id: "x", assignedTo: "tlk1" };
  assert.equal(accionesRegistroV2(actor("super_admin"), r, "agregado").borrarDefinitivo, true);          // 12
  assert.equal(accionesRegistroV2(actor("distribuidor"), r, "agregado").borrarDefinitivo, true);         // 13
  assert.equal(accionesRegistroV2(actor("supervisor"), r, "agregado").borrarDefinitivo, false);          // 14
  for (const t of ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"])
    assert.equal(accionesRegistroV2(actor(t, "tlk1"), r, "agregado").borrarDefinitivo, false, t);        // 15
  // editar / papelera / restaurar: clientes.edit (staff) o clientes.assigned.edit sobre lo asignado (TLK)
  assert.deepEqual(accionesRegistroV2(actor("supervisor"), r, "agregado"), { editar: true, papelera: true, restaurar: true, borrarDefinitivo: false, agendar: true, resultadoFisico: true });
  assert.equal(accionesRegistroV2(actor("telemarketing_ventas", "tlk1"), r, "agregado").editar, true);
  assert.equal(accionesRegistroV2(actor("telemarketing_ventas", "tlk2"), r, "agregado").editar, false);   // no es suyo
  assert.equal(accionesRegistroV2(actor("telemarketing_cobranza", "tlk1"), r, "agregado").editar, false); // sin permiso de clientes
  assert.equal(accionesRegistroV2(actor("supervisor"), r, "referido").editar, true);                      // referidos: clientes.edit también sirve
  // no se amplían permisos: ventas.manage sigue sin ser del supervisor
  assert.equal(can(U("supervisor"), "ventas.manage"), false);
  // ClientRow aplica las acciones solo cuando vienen (v2); legacy sin cambio
  for (const g of ["(!acciones||acciones.agendar)", "(!acciones||acciones.editar)", "(!acciones||acciones.papelera)", "(!acciones||acciones.restaurar)", "(!acciones||acciones.borrarDefinitivo)"])
    assert.ok(APP.includes(g), g);
  assert.ok(APP.includes("acciones={v2?accionesRegistroV2(v2.actor, c, type):null}"));
});

test("16 · Reconciliación: auto-creado sin trabajo → PAPELERA con motivo; nunca sale de la lista (sin delete)", () => {
  const venta = { id: "c7", tipo: "cita", resultado: "demo_venta", monto: 100, nombre: "Beto", telefono: "2105550303", sourceSection: "agregados", sourceRecordId: "a1" };
  const creado = distribucionDesdeVenta([], venta, NOW).lista;
  const corregida = { ...venta, resultado: "demo_no_venta" };
  const r = reconciliarDistribucionPorVenta(creado, corregida, NOW, { uid: "dist1", nombre: "Tomas" });
  assert.equal(r.accion, "papelera"); assert.equal(r.lista.length, 1);
  assert.deepEqual([r.lista[0].eliminado, r.lista[0].eliminadoMotivo, r.lista[0].eliminadoPorUid, r.lista[0].ventasOrigen], [true, "Venta corregida", "dist1", []]);
  // el store: es un SET (actualiza eliminado), no un DELETE, para cualquier staff
  for (const role of ["super_admin", "distribuidor", "supervisor"]) {
    const d = emptyDocs(); d.records["dv_c7"] = { ...creado[0], section: "distribucion", appId: "impactos" };
    const res = diffState({ distribucion: creado }, { distribucion: r.lista }, d, { uid: "u", role, appId: "impactos", nombre: "X" } as any);
    assert.deepEqual([res.ops.map((o: any) => o.kind), res.blocked.length], [["set"], 0], role);
  }
  assert.equal(APP.includes('"retirado"'), false);
});

test("17-18 · Reconciliación: auto-creado trabajado → activo y desvinculado; preexistente → activo", () => {
  const venta = { id: "c7", tipo: "cita", resultado: "demo_venta", nombre: "Beto", telefono: "2105550303" };
  const corregida = { ...venta, resultado: "no_recibio" };
  const base = distribucionDesdeVenta([], venta, NOW).lista[0];
  for (const trabajo of [{ notas: [{ texto: "x" }] }, { historial: [{ tipo: "llamada" }] }, { assignedTo: "tlk1" }, { linkedRecordId: "cob_1" }, { ultimaNota: "ok" }, { estado: "contactado" }])
    { assert.ok(registroTrabajado({ ...base, ...trabajo }, []), JSON.stringify(trabajo));            // sin contar la venta corregida
      const r = reconciliarDistribucionPorVenta([{ ...base, ...trabajo }], corregida, NOW);
      assert.deepEqual([r.accion, r.lista[0].eliminado, r.lista[0].ventasOrigen, "ventaOrigenApptId" in r.lista[0]], ["desvinculado", undefined, [], false], JSON.stringify(trabajo)); }   // 17
  assert.equal(registroTrabajado(base, []), false);                                                  // recién creado, sin trabajo
  assert.equal(registroTrabajado(base), true);                                                      // con su propia venta aún vigente sí cuenta
  const pre = [{ id: "d1", nombre: "Beto", telefono: "2105550303", historial: [{ x: 1 }], ventasOrigen: [{ apptId: "c7" }, { apptId: "otra" }] }];
  const r2 = reconciliarDistribucionPorVenta(pre, corregida, NOW);                                            // 18
  assert.deepEqual([r2.accion, r2.lista[0].eliminado, r2.lista[0].ventasOrigen.map((v: any) => v.apptId)], ["desvinculado", undefined, ["otra"]]);
  // no es venta → omitido; sigue siendo venta → vincula
  assert.equal(esVentaParaDistribucion(corregida), false);
  assert.equal(reconciliarDistribucionPorVenta([], venta, NOW).accion, "creado");
});

test("19 · Supervisor corrige una venta: la reconciliación produce solo SET (sin blocked ni delete) → sin estado inconsistente", () => {
  const venta = registrarVentaServicio({ id: "s1", tipo: "servicio", _type: "servicio", nombre: "Ana", telefono: "2105550101" }, { monto: 300 }, { uid: "sup1", nombre: "Eva" }, NOW);
  const dist = distribucionDesdeVenta([], venta, NOW).lista;
  const corregido = registrarResultadoServicio(venta, "no_visito", { uid: "sup1", nombre: "Eva" }, NOW);
  const r = reconciliarDistribucionPorVenta(dist, corregido, NOW, { uid: "sup1", nombre: "Eva" });
  const d = emptyDocs(); d.records["dv_s1"] = { ...dist[0], section: "distribucion", appId: "impactos" };
  const res = diffState({ distribucion: dist }, { distribucion: r.lista }, d, { uid: "sup1", role: "supervisor", appId: "impactos", nombre: "Eva" } as any);
  assert.deepEqual([r.accion, res.ops.length, res.ops[0].kind, res.blocked.length, (res.ops[0] as any).data.eliminado], ["papelera", 1, "set", 0, true]);
  assert.ok(APP.includes("reconciliarDistribucionPorVenta(st.distribucion||[], appt, new Date(), { uid:v2User.uid, nombre:v2User.nombre })"));
});

test("20-25 · Venta desde la tarjeta: resultByUid/Name/At, historial, Distribución, sin duplicar registro ni métricas", () => {
  const c = { id: "a1", nombre: "Beto", telefono: "2105550303", direccion: "9 Oak", ciudad: "Waco", cp: "76701", cuenta: "RP-9", createdByUid: "tlk1", createdByName: "Liam" };
  const { registro, venta } = ventaDesdeRegistro(c, "agregado", { monto: 2500, producto: "Sartenes", detail: "ok", cartucho_meses: 6 }, { uid: "sup1", nombre: "Eva" }, NOW);
  assert.deepEqual([registro.resultByUid, registro.resultByName, registro.resultAt], ["sup1", "Eva", NOW.toISOString()]);   // 20-22
  assert.deepEqual([registro.venta, registro.resultado, registro.ultimo_monto_venta, registro.ultimo_producto, registro.ultimo_cartucho_meses], [true, "demo_venta", 2500, "Sartenes", 6]);
  // 23 · entra a Distribución con origen, datos y referencia a la venta
  const d1 = distribucionDesdeVenta([], venta, NOW);
  assert.equal(d1.accion, "creado");
  const n = d1.lista[0];
  assert.deepEqual([n.sourceSection, n.sourceRecordId, n.nombre, n.telefono, n.cuenta, n.createdByUid, n.ventasOrigen[0].porNombre, n.ventasOrigen[0].monto], ["agregados", "a1", "Beto", "2105550303", "RP-9", "tlk1", "Eva", 2500]);
  // 24 · la misma venta otra vez: NO crea otro registro. Mientras la venta sigue vigente, volver a registrarla
  //      reutiliza su id estable (ventaRegistroId) → ni registro ni referencia duplicados.
  assert.equal(distribucionDesdeVenta(d1.lista, venta, NOW).accion, "sin_cambios");
  const venta2 = ventaDesdeRegistro(registro, "agregado", { monto: 100 }, { uid: "sup1", nombre: "Eva" }, new Date(NOW.getTime() + 60000)).venta;
  assert.equal(venta2.id, venta.id);
  const d2 = distribucionDesdeVenta(d1.lista, venta2, NOW);
  assert.deepEqual([d2.accion, d2.lista.length, d2.lista[0].ventasOrigen.length], ["sin_cambios", 1, 1]);
  // referido: índice del referido
  const vr = ventaDesdeRegistro({ _refDe: "anf1", _refIdx: 1, _tipo: "referidos", nombre: "Marta", telefono: "2105550404" }, "referido", { monto: 50 }, { uid: "sup1", nombre: "Eva" }, NOW).venta;
  assert.deepEqual([vr.sourceSection, vr.sourceRecordId, vr.sourceRefIndex], ["referidos", "anf1", 1]);
  // 25 · métricas: la venta se cuenta UNA vez (historial del cliente, como siempre); ni la pseudo-venta ni el registro de Distribución suman
  const historial = [{ cita_resultado: "demo_venta", fecha: "2026-10-02", monto: 2500, uid: "sup1", nombre: "Eva" }];
  const m = contarVentasDemosV2({ appts: [], clientes: [{ ...registro, historial }, n], enP: () => true });
  assert.deepEqual(m, { demos: 1, ventas: 1, volumen: 2500, cierre: 100 });
  assert.equal(venta.tipo, "cita"); assert.ok(!("_type" in venta));
  assert.ok(APP.includes("const { registro, venta } = ventaDesdeRegistro(c, type, { monto, producto, detail, cartucho_meses }, v2.autor, new Date());"));
  assert.ok(APP.includes("if(v2.onVenta) v2.onVenta(venta);"));
  assert.ok(APP.includes("v2?{...entry, uid:v2.autor.uid, nombre:v2.autor.nombre}:entry"));                 // historial con identidad real
  assert.ok(APP.includes(`else if(id==="demo_venta")      setData(p=>p.map(x=>x.id===c.id?{...x,venta:true, resultado:"demo_venta",`));   // legacy intacto
});

test("26 · Clave estable por id en v2; legacy conserva la clave por índice", () => {
  assert.ok(APP.includes("key={v2?`db-${type}-${String(c.id)}`:`db-${idx}-${type}-${String(c.id)}`}"));
  assert.ok(APP.includes("key={v2?`dbref-${String(c.id)}`:`dbref-${idx}-${String(c.id)}`}"));
  // simulación: al filtrar, la clave de un registro no cambia (v2) y sí cambia (legacy, por índice)
  const keyV2 = (c: any) => `db-agregado-${String(c.id)}`, keyLeg = (c: any, idx: number) => `db-${idx}-agregado-${String(c.id)}`;
  const antes = muchos, despues = muchos.filter((c: any) => c.ciudad === "Temple");
  const r1 = despues[0];
  assert.equal(keyV2(r1), keyV2(antes.find((c: any) => c.id === r1.id)));
  assert.notEqual(keyLeg(r1, despues.indexOf(r1)), keyLeg(r1, antes.indexOf(r1)));
});

test("Montaje: v2 → DatabaseV2 (envuelve DBSection con la configuración v2); legacy → DBSection con las props de siempre", () => {
  for (const sec of ["agregados", "referidos", "prospectos", "distribucion"]) {
    assert.ok(APP.includes(`{tab==="${sec}" && (ACCESS_V2 && v2User\n              ? <DatabaseV2 Base={DBSection} baseProps={propsBaseDatos("${sec}")} v2User={v2User} can={canDo} onVenta={asegurarDistribucionPorVenta} />\n              : <DBSection data={allData.${sec}} setData={fn=>setSection("${sec}",fn)}`), sec);
  }
  const ui = fs.readFileSync(new URL("../src/components/database/DatabaseV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes("return <Base {...baseProps} v2={v2} />;"));
  // normalizadores
  assert.equal(normTelefono("+1 (210) 555-0101"), "2105550101"); assert.equal(normCuenta(" RP-77 "), "rp77"); assert.equal(normTexto("  JOSÉ  Pérez "), "jose perez");
  assert.deepEqual(telefonosDe({ telefono: "210-555-0101", telefonoMovil: "254.555.9999", tel: "12" }), ["2105550101", "2545559999"]);
});

// ════════ r1 (corrección): vista especial de Referidos en V2 ════════
const bloqueReferidos = () => { const i = APP.indexOf("{listaRender.map((c,idx)=>{ const accRefV2"); return APP.slice(i, APP.indexOf("acciones={v2?accionesRegistroV2(v2.actor, c, type):null} c={c} type={type}", i)); };

test("R1 · Referidos v2: anfitrión y referidos individuales reciben acciones v2; sin papelera/definitivo propios en las tarjetas internas", () => {
  const b = bloqueReferidos();
  assert.ok(b.includes('const accRefV2 = v2 ? { ...accionesRegistroV2(v2.actor, c, "referido"), papelera:false, restaurar:false, borrarDefinitivo:false } : null;'));
  assert.ok(b.includes('<ClientRow acciones={accRefV2} {...(v2?{inPapelera:!!c.eliminado}:{})} c={anfCard} type="anfitrion"'), "anfitrión");
  assert.ok(b.includes('<ClientRow key={claveRef} acciones={accRefV2} {...(v2?{inPapelera:!!c.eliminado}:{})} c={refCard} type="referido-llamada"'), "referido individual");
  // permisos por rol en un anfitrión (editar según permisos; las tarjetas internas nunca muestran definitivo)
  const anf = { id: "anf1", anfitrion: "Rita", assignedTo: "tlk1", referidos: [{ nombre: "Marta" }] };
  const interna = (a: any) => ({ ...accionesRegistroV2(a, anf, "referido"), papelera: false, restaurar: false, borrarDefinitivo: false });
  for (const [role, uid, editar] of [["super_admin", "u", true], ["distribuidor", "u", true], ["supervisor", "u", true], ["telemarketing_ventas", "tlk1", true], ["telemarketing_ventas", "otra", false], ["telemarketing_cobranza", "tlk1", false]] as const) {
    const a = actor(role, uid);
    assert.equal(accionesRegistroV2(a, anf, "referido").editar, editar, `${role}/${uid} editar`);
    assert.equal(interna(a).borrarDefinitivo, false, `${role} tarjeta interna`);
  }
});

test("R2 · Fila del anfitrión v2: Editar/Papelera/Restaurar según acciones; Definitivo solo super_admin/distribuidor; Supervisor/TLK nunca", () => {
  const b = bloqueReferidos();
  const v2Row = b.slice(b.indexOf(': (()=>{ const acc=accionesRegistroV2(v2.actor, c, "referido"); return ('));
  assert.ok(v2Row.includes("{!c.eliminado && acc.editar && <button"));
  assert.ok(v2Row.includes("{!c.eliminado && acc.papelera && <button onClick={()=>setData(p=>p.map(x=>x.id===c.id?{...x,eliminado:true}:x))}"));
  assert.ok(v2Row.includes("{c.eliminado && acc.restaurar && <button onClick={()=>setData(p=>p.map(x=>x.id===c.id?{...x,eliminado:false}:x))}"));
  assert.ok(v2Row.includes("{c.eliminado && acc.borrarDefinitivo && <button"));
  const anf = { id: "anf1", assignedTo: "tlk1" };
  assert.equal(accionesRegistroV2(actor("super_admin"), anf, "referido").borrarDefinitivo, true);
  assert.equal(accionesRegistroV2(actor("distribuidor"), anf, "referido").borrarDefinitivo, true);
  assert.equal(accionesRegistroV2(actor("supervisor"), anf, "referido").borrarDefinitivo, false);
  assert.equal(accionesRegistroV2(actor("telemarketing_ventas", "tlk1"), anf, "referido").borrarDefinitivo, false);
});

test("R3 · Ninguna acción v2 de Referidos borra físicamente con filter() salvo el Definitivo (solo super_admin/distribuidor); legacy conserva su botón", () => {
  const b = bloqueReferidos();
  const legacy = b.slice(b.indexOf("{!v2 ? "), b.indexOf(': (()=>{ const acc=accionesRegistroV2(v2.actor, c, "referido"); return ('));
  const v2Row = b.slice(b.indexOf(': (()=>{ const acc=accionesRegistroV2(v2.actor, c, "referido"); return ('));
  assert.ok(legacy.includes("<button onClick={()=>setData(p=>p.filter(x=>x.id!==c.id))}"), "legacy intacto");
  const filtros = v2Row.match(/setData\(p=>p\.filter\(/g) || [];
  assert.equal(filtros.length, 1);                                                             // solo dentro del Definitivo
  assert.ok(/\{c\.eliminado && acc\.borrarDefinitivo && <button onClick=\{\(\)=>\{if\(confirm\([^)]*\)\)setData\(p=>p\.filter\(x=>x\.id!==c\.id\)\);\}\}/.test(v2Row));
  // el store: un Supervisor que manda a papelera produce SET (sin delete ni blocked)
  const anf = { id: "anf1", anfitrion: "Rita", referidos: [] };
  const d = emptyDocs(); d.records.anf1 = { ...anf, section: "referidos", appId: "impactos" };
  const res = diffState({ referidos: [anf] }, { referidos: [{ ...anf, eliminado: true }] }, d, { uid: "sup1", role: "supervisor", appId: "impactos", nombre: "Eva" } as any);
  assert.deepEqual([res.ops.map((o: any) => o.kind), res.blocked.length], [["set"], 0]);
});

test("R4 · Venta desde el ANFITRIÓN: resultBy*, monto/producto/meses en el documento real (sin alias de la tarjeta) y Venta → Distribución", () => {
  const host = { id: "anf1", anfitrion: "Rita Gómez", anfitrion_telefono: "2105550000", anfitrion_ciudad: "Temple", anfitrion_cuenta: "RP-5", referidos: [{ nombre: "Marta" }] };
  const anfCard = { ...host, nombre: host.anfitrion, telefono: host.anfitrion_telefono, ciudad: host.anfitrion_ciudad, cuenta: host.anfitrion_cuenta, direccion: "" };
  const { registro, venta } = ventaDesdeRegistro({ ...anfCard, id: host.id }, "referido", { monto: 1800, producto: "Purificador", cartucho_meses: 12 }, { uid: "dist1", nombre: "Tomas" }, NOW);
  const patch = camposVenta(registro);
  assert.deepEqual(Object.keys(patch).sort(), ["resultAt", "resultByName", "resultByUid", "resultado", "ultimo_cartucho_meses", "ultimo_monto_venta", "ultimo_producto", "venta", "ventaRegistroId"].sort());
  assert.equal(patch.ventaRegistroId, venta.id);                                                    // mismo id en el registro y en ventasOrigen
  assert.deepEqual([patch.resultByUid, patch.resultByName, patch.resultAt, patch.ultimo_monto_venta, patch.ultimo_producto, patch.ultimo_cartucho_meses], ["dist1", "Tomas", NOW.toISOString(), 1800, "Purificador", 12]);
  assert.equal("nombre" in patch, false);                                                     // no pisa anfitrion/referidos del documento
  assert.deepEqual([venta.sourceSection, venta.sourceRecordId, "sourceRefIndex" in venta, venta.nombre, venta.telefono, venta.monto, venta.producto], ["referidos", "anf1", false, "Rita Gómez", "2105550000", 1800, "Purificador"]);
  const dist = distribucionDesdeVenta([], venta, NOW);
  assert.deepEqual([dist.accion, dist.lista[0].sourceSection, dist.lista[0].sourceRecordId, dist.lista[0].cuenta], ["creado", "referidos", "anf1", "RP-5"]);
  assert.ok(bloqueReferidos().includes('const { registro, venta } = ventaDesdeRegistro({...anfCard, id:c.id}, "referido", { monto, producto, detail, cartucho_meses }, v2.autor, new Date());\n                      patchAnf(camposVenta(registro));'));
});

test("R5 · Venta desde un REFERIDO individual: resultBy*, sourceRecordId = anfitrión, sourceRefIndex real; entra a Distribución sin duplicar", () => {
  const refCard = { nombre: "Marta López", telefono: "2105550303", id: "anf1::2", _anfitrion: "Rita" };
  const { registro, venta } = ventaDesdeRegistro(refCard, "referido", { monto: 950, producto: "Ducha", cartucho_meses: 6 }, { uid: "sup1", nombre: "Eva" }, NOW);
  const patch = camposVenta(registro);
  assert.deepEqual([patch.resultByUid, patch.resultByName, patch.resultAt, patch.ultimo_monto_venta, patch.ultimo_producto, patch.ultimo_cartucho_meses], ["sup1", "Eva", NOW.toISOString(), 950, "Ducha", 6]);
  assert.deepEqual([venta.sourceSection, venta.sourceRecordId, venta.sourceRefIndex, venta.monto, venta.producto], ["referidos", "anf1", 2, 950, "Ducha"]);
  const d1 = distribucionDesdeVenta([], venta, NOW);
  assert.deepEqual([d1.accion, d1.lista[0].sourceSection, d1.lista[0].sourceRecordId, d1.lista[0].sourceRefIndex], ["creado", "referidos", "anf1", 2]);
  assert.equal(distribucionDesdeVenta(d1.lista, venta, NOW).accion, "sin_cambios");                    // no duplica
  // otro referido del mismo anfitrión es otro cliente
  const otro = ventaDesdeRegistro({ ...refCard, id: "anf1::0", nombre: "Juan", telefono: "2105550909" }, "referido", { monto: 1 }, { uid: "sup1", nombre: "Eva" }, NOW).venta;
  assert.equal(distribucionDesdeVenta(d1.lista, otro, NOW).accion, "creado");
  // métricas: una sola venta (historial del referido); ni la pseudo-venta ni Distribución suman
  const m = contarVentasDemosV2({ appts: [], clientes: [{ historial: [{ cita_resultado: "demo_venta", fecha: "2026-10-02", monto: 950 }] }, d1.lista[0]], enP: () => true });
  assert.deepEqual([m.ventas, m.volumen, m.demos], [1, 950, 1]);
  assert.ok(bloqueReferidos().includes('const { registro, venta } = ventaDesdeRegistro(refCard, "referido", { monto, producto, detail, cartucho_meses }, v2.autor, new Date());\n                        patchRef(camposVenta(registro));'));
  // historial con autor real (anfitrión y referido)
  assert.ok(bloqueReferidos().includes("historial:[...lst(anf.historial),v2?{...entry, uid:v2.autor.uid, nombre:v2.autor.nombre}:entry]"));
  assert.ok(bloqueReferidos().includes("historial:[...lst(refs[i].historial),v2?{...entry, uid:v2.autor.uid, nombre:v2.autor.nombre}:entry]"));
});

test("R6 · Clave estable de cada referido (v2): id → clave del mapa → teléfono/nombre; índice solo último recurso", () => {
  assert.deepEqual(clavesReferidos({ id: "anf1", referidos: [{ id: "r9", nombre: "A" }, { nombre: "Marta López", telefono: "(210) 555-0303" }, {}] }),
    ["ref-anf1-id:r9", "ref-anf1-t:2105550303|n:marta lopez", "ref-anf1-i:2"]);
  assert.deepEqual(clavesReferidos({ id: "anf2", referidos: { ref_abc: { nombre: "María" }, ref_xyz: { nombre: "Carlos" } } }), ["ref-anf2-k:ref_abc", "ref-anf2-k:ref_xyz"]);
  assert.deepEqual(clavesReferidos({ id: "a", referidos: [{ nombre: "Ana" }, { nombre: "Ana" }] }), ["ref-a-t:|n:ana", "ref-a-t:|n:ana#2"]);   // únicas sin usar la posición
  // al quitar un referido anterior, la clave de los siguientes no cambia
  const lista = [{ nombre: "Uno", telefono: "2105550001" }, { nombre: "Dos", telefono: "2105550002" }];
  assert.equal(clavesReferidos({ id: "a", referidos: lista })[1], clavesReferidos({ id: "a", referidos: [lista[1]] })[0]);
  const b = bloqueReferidos();
  assert.ok(b.includes("const claveRef = v2 ? clavesReferidosV2[i] : i;"));
  assert.ok(b.includes("const clavesReferidosV2 = v2 ? clavesReferidos(c) : null;"));
  assert.equal(/<ClientRow key=\{i\} /.test(b), false);                                         // ya no key={i} directo
});

// ════════ r1 (corrección final): resultado físico por rol · corrección de venta de tarjeta · cuenta del anfitrión · papelera de referidos ════════
const bloqueClientRow = () => { const i = APP.indexOf("function ClientRow("); return APP.slice(i, APP.indexOf("function DBSection(", i)); };
const bloqueHandle = () => { const i = APP.indexOf("const handleApptResult=(c,id,"); return APP.slice(i, APP.indexOf("const exportCSV=", i)); };

test("F1-F3 · Resultado FÍSICO: TLK no; supervisor y distribuidor sí (misma regla que Agenda); guard en botón, panel y manejadores", () => {
  const r = { id: "x", assignedTo: "tlk1", estado: "verde" };
  for (const t of ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"]) assert.equal(accionesRegistroV2(actor(t, "tlk1"), r, "agregado").resultadoFisico, false, t);   // 1
  assert.equal(accionesRegistroV2(actor("supervisor"), r, "agregado").resultadoFisico, true);                                                                          // 2
  assert.equal(accionesRegistroV2(actor("distribuidor"), r, "agregado").resultadoFisico, true);                                                                        // 3
  assert.equal(accionesRegistroV2(actor("super_admin"), r, "agregado").resultadoFisico, true);
  assert.equal(can(U("supervisor"), "ventas.manage"), false);                                                                                                          // no se amplía
  const cr = bloqueClientRow();
  assert.ok(cr.includes("const puedeResultadoFisico = !acciones || acciones.resultadoFisico !== false;"));
  assert.ok(cr.includes("const verResultado = !isCita || puedeResultadoFisico;"));
  assert.ok(cr.includes("{!inPapelera && verResultado && ("), "botón Resultado cita");
  assert.ok(cr.includes("{showResult && !inPapelera && verResultado && ("), "panel");
  assert.ok(cr.includes("if(isCita && !puedeResultadoFisico) return;   // guard v2"), "guard en handleResultClick");
  assert.ok(bloqueHandle().includes("if(v2 && !accionesRegistroV2(v2.actor, c, type).resultadoFisico) return;"), "guard en DBSection");
  assert.equal((bloqueReferidos().match(/if\(v2 && !accRefV2\.resultadoFisico\) return;/g) || []).length, 2, "guard anfitrión y referido");
});

test("F4 · TLK conserva el resultado de LLAMADA cuando el registro NO está en estado de cita (legacy siempre igual)", () => {
  const ver = (acciones: any, estado: string) => { const isCita = estado === "verde"; const puede = !acciones || acciones.resultadoFisico !== false; return !isCita || puede; };
  const tlk = accionesRegistroV2(actor("telemarketing_ventas", "tlk1"), { assignedTo: "tlk1" }, "agregado");
  assert.equal(ver(tlk, "amarillo"), true);       // llamada: visible
  assert.equal(ver(tlk, ""), true);
  assert.equal(ver(tlk, "verde"), false);         // cita: oculto
  assert.equal(ver(null, "verde"), true);         // legacy (acciones=null): siempre
  // el guard solo bloquea en cita: la rama de llamada no pasa por onApptResult físico
  assert.ok(/const handleResultClick=\(r\)=>\{\s*if\(isCita && !puedeResultadoFisico\) return;/.test(bloqueClientRow()));
});

test("F5-F10 · Venta desde tarjeta → Distribución con id estable; corrección → reconciliación (papelera / desvinculado) con nuevo resultBy*", () => {
  const T0 = NOW, T1 = new Date(NOW.getTime() + 3600000);
  const c = { id: "a1", nombre: "Beto", telefono: "2105550303", sourceSection: undefined };
  const { registro, venta } = ventaDesdeRegistro(c, "agregado", { monto: 2500, producto: "Sartenes" }, { uid: "dist1", nombre: "Tomas" }, T0);
  assert.ok(registro.ventaRegistroId && registro.ventaRegistroId === venta.id);                              // id estable en el registro
  const dist = distribucionDesdeVenta([], venta, T0);                                                          // 5
  assert.deepEqual([dist.accion, dist.lista[0].ventasOrigen[0].apptId], ["creado", venta.id]);
  // 6/10 · corrección (Eva) a demo_no_venta: sella autor nuevo y devuelve el evento con el MISMO id
  const corr = correccionDesdeRegistro(registro, "demo_no_venta", { uid: "sup1", nombre: "Eva" }, T1);
  assert.deepEqual([corr.patch.resultByUid, corr.patch.resultByName, corr.patch.resultAt, corr.patch.venta, "ventaRegistroId" in corr.patch, corr.patch.ventaRegistroId],
    ["sup1", "Eva", T1.toISOString(), false, true, undefined]);
  assert.deepEqual(corr.reconciliar, { id: venta.id, tipo: "cita", resultado: "demo_no_venta" });
  for (const r of ["no_recibio", "no_visito", "seguimiento"]) assert.equal(correccionDesdeRegistro(registro, r, { uid: "sup1", nombre: "Eva" }, T1).reconciliar!.id, venta.id, r);
  // 7 · auto-creado sin trabajo → papelera (sin delete)
  const a = reconciliarDistribucionPorVenta(dist.lista, corr.reconciliar, T1, { uid: "sup1", nombre: "Eva" });
  assert.deepEqual([a.accion, a.lista.length, a.lista[0].eliminado, a.lista[0].eliminadoMotivo, a.lista[0].eliminadoPorUid], ["papelera", 1, true, "Venta corregida", "sup1"]);
  // 8 · trabajado → activo y desvinculado
  const b = reconciliarDistribucionPorVenta([{ ...dist.lista[0], notas: [{ texto: "llamar" }] }], corr.reconciliar, T1);
  assert.deepEqual([b.accion, b.lista[0].eliminado, b.lista[0].ventasOrigen], ["desvinculado", undefined, []]);
  // 9 · preexistente → activo y desvinculado
  const pre = [{ id: "d9", nombre: "Beto", telefono: "2105550303", ventasOrigen: [{ apptId: venta.id }, { apptId: "otra" }] }];
  const p2 = reconciliarDistribucionPorVenta(pre, corr.reconciliar, T1);
  assert.deepEqual([p2.accion, p2.lista[0].eliminado, p2.lista[0].ventasOrigen.map((v: any) => v.apptId)], ["desvinculado", undefined, ["otra"]]);
  // sin venta vigente no hay nada que reconciliar (pero sí se sella el autor)
  const sinVenta = correccionDesdeRegistro({ id: "z" }, "no_recibio", { uid: "sup1", nombre: "Eva" }, T1);
  assert.deepEqual([sinVenta.reconciliar, sinVenta.patch.resultByUid, "venta" in sinVenta.patch], [null, "sup1", false]);
  // tras la corrección, una venta nueva genera un id NUEVO (otra referencia)
  const tras = { ...registro, ...corr.patch, resultado: "demo_no_venta" };
  assert.notEqual(ventaDesdeRegistro(tras, "agregado", { monto: 1 }, { uid: "sup1", nombre: "Eva" }, new Date(T1.getTime() + 1000)).venta.id, venta.id);
  // App: misma reconciliación (conDistribucionV2) para tarjeta, anfitrión y referido; sin appts
  assert.ok(bloqueHandle().includes("const { patch, reconciliar } = correccionDesdeRegistro(c, id, v2.autor, new Date());"));
  assert.ok(bloqueHandle().includes("if(reconciliar && v2.onVenta) v2.onVenta(reconciliar);"));
  assert.ok(bloqueReferidos().includes("const { patch, reconciliar } = correccionDesdeRegistro(c, rid, v2.autor, new Date());"));
  assert.ok(bloqueReferidos().includes("const { patch, reconciliar } = correccionDesdeRegistro(refCard, rid, v2.autor, new Date());"));
  assert.equal(/setAppts\(/.test(bloqueHandle()), false);                                                  // no crea citas
});

test("F11 · anfitrion_cuenta detecta duplicado por cuenta (alta de anfitrión y contra anfitriones existentes)", () => {
  const allData = { agregados: [{ id: "a1", nombre: "Ana", telefono: "2105550101", cuenta: "RP-77" }], prospectos: [], distribucion: [],
    referidos: [{ id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2105550000", anfitrion_cuenta: "RP-88", referidos: [] }] };
  const d = candidatosDuplicadoAnfitrion({ anfitrion: "Nuevo", anfitrion_telefono: "1", anfitrion_cuenta: "rp 77", referidos: [] }, allData);
  assert.deepEqual(d.map((x) => [x.motivo, x.existente.id]), [["cuenta", "a1"]]);
  const d2 = candidatosDuplicadoAnfitrion({ anfitrion: "Otro", anfitrion_telefono: "2", anfitrion_cuenta: "RP88", referidos: [] }, allData);
  assert.deepEqual(d2.map((x) => [x.motivo, x.existente.id]), [["cuenta", "anf1"]]);                       // contra la cuenta de un anfitrión
  assert.equal(candidatoDuplicado({ nombre: "X", telefono: "3", cuenta: "rp-88" }, allData)!.existente.id, "anf1");   // agregado nuevo vs anfitrión
  assert.ok(textoDuplicado(d[0]).includes("el mismo número de cuenta"));
  assert.equal(candidatosDuplicadoAnfitrion({ anfitrion: "Sin", anfitrion_telefono: "4", referidos: [] }, allData).length, 0);
});

test("F12 · Anfitrión en papelera: sus tarjetas internas reciben inPapelera (sin Resultado/Agendar/Editar); legacy sin cambios", () => {
  const b = bloqueReferidos();
  assert.equal((b.match(/\{\.\.\.\(v2\?\{inPapelera:!!c\.eliminado\}:\{\}\)\}/g) || []).length, 2);
  // con inPapelera, ClientRow oculta Resultado (!inPapelera), Agendar/Editar/Papelera (!inPapelera) y, con acciones internas,
  // tampoco muestra Restaurar ni Definitivo (los maneja la fila del anfitrión)
  const cr = bloqueClientRow();
  for (const g of ["{!inPapelera && verResultado && (", "{!inPapelera && (!acciones||acciones.agendar) &&", "{!inPapelera && (!acciones||acciones.editar) &&", "{inPapelera && (!acciones||acciones.restaurar) &&", "{inPapelera && (!acciones||acciones.borrarDefinitivo) &&"])
    assert.ok(cr.includes(g), g);
  const interna = { ...accionesRegistroV2(actor("distribuidor"), { id: "anf1" }, "referido"), papelera: false, restaurar: false, borrarDefinitivo: false };
  assert.deepEqual([interna.restaurar, interna.borrarDefinitivo], [false, false]);
});

// ════════ r1 (bug visual): el dato junto al aviso depende del MOTIVO del duplicado ════════
import { valorDuplicado } from "../src/components/database/DatabaseV2";
test("V1-V4 · AvisoDuplicadoDB: cuenta → cuenta; teléfono → teléfono; nunca el teléfono para cuenta ni para nombre+dirección", () => {
  const allData = {
    agregados: [{ id: "a39", nombre: "Prueba A39", telefono: "254-555-1039", cuenta: "123456789", direccion: "9 Oak St" }],
    prospectos: [], distribucion: [],
    referidos: [{ id: "anf1", anfitrion: "Rita", anfitrion_telefono: "2105550000", anfitrion_cuenta: "RP-88", referidos: [] }],
  };
  // 1 · cuenta → muestra la cuenta
  const dc = candidatoDuplicado({ nombre: "Otro", telefono: "1", cuenta: "123456789" }, allData)!;
  assert.equal(dc.motivo, "cuenta");
  assert.equal(valorDuplicado(dc), "123456789");
  assert.equal(`${textoDuplicado(dc)} · ${valorDuplicado(dc)}`, 'Posible duplicado: "Prueba A39" en Agregados tiene el mismo número de cuenta. · 123456789');
  const dca = candidatoDuplicado({ nombre: "X", telefono: "2", cuenta: "rp88" }, allData)!;          // cuenta de anfitrión
  assert.deepEqual([dca.motivo, valorDuplicado(dca)], ["cuenta", "RP-88"]);
  assert.equal(valorDuplicado({ motivo: "cuenta", existente: { numeroCuenta: "N-1", telefono: "999" }, seccion: "agregados", fuerte: true }), "N-1");
  // 2 · teléfono → muestra el teléfono
  const dt = candidatoDuplicado({ nombre: "Otro", telefono: "(254) 555 1039" }, allData)!;
  assert.deepEqual([dt.motivo, valorDuplicado(dt)], ["telefono", "254-555-1039"]);
  const dth = candidatoDuplicado({ nombre: "Otro", telefono: "210 555 0000" }, allData)!;           // teléfono de anfitrión
  assert.deepEqual([dth.motivo, valorDuplicado(dth)], ["telefono", "2105550000"]);
  // 3 · cuenta NO muestra el teléfono como valor
  assert.ok(!valorDuplicado(dc).includes("254-555-1039") && !valorDuplicado(dc).includes("5551039"));
  // 4 · nombre + dirección → la dirección, no el teléfono
  const dn = candidatoDuplicado({ nombre: "prueba a39", telefono: "7", direccion: "9 oak st." }, allData)!;
  assert.deepEqual([dn.motivo, valorDuplicado(dn)], ["nombre_direccion", "9 Oak St"]);
  assert.ok(!valorDuplicado(dn).includes("555"));
  // origen → id del registro de origen (con índice de referido si lo hay)
  assert.equal(valorDuplicado({ motivo: "origen", existente: { sourceRecordId: "anf1", sourceRefIndex: 2, telefono: "999" }, seccion: "prospectos", fuerte: true }), "origen anf1 · referido 2");
  // el componente usa el helper (no el teléfono fijo)
  const ui = fs.readFileSync(new URL("../src/components/database/DatabaseV2.tsx", import.meta.url), "utf8");
  assert.ok(ui.includes("{valorDuplicado(d) ? <span className=\"text-amber-700\"> · {valorDuplicado(d)}</span> : null}"));
  assert.equal(ui.includes("d.existente?.telefono ?"), false);
});
