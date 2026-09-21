#!/usr/bin/env node
/**
 * MIGRADOR ImpactOS — crm_telemarketing → workspaces/{appId}
 *
 *   node scripts/migrate.mjs --app impactos --dry
 *   node scripts/migrate.mjs --app impactos --run
 *
 * Reglas: SOLO copia. Nunca borra ni modifica crm_telemarketing, y nunca
 * sobrescribe un documento nuevo que ya exista. Correrlo dos veces no duplica.
 * Se puede interrumpir y reanudar (guarda el avance en _migration/v1).
 *
 * Requiere: npm i firebase-admin
 *           GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccount.json
 */
import fs from "node:fs";
import admin from "firebase-admin";
import { joinLegacyDocs, planMigration, verifyMigration, formatReport, mapLegacyRole } from "../dist-migration/migration.js";

const arg = (n, d = null) => { const i = process.argv.indexOf("--" + n); return i > -1 ? (process.argv[i + 1]?.startsWith("--") ? true : process.argv[i + 1]) : d; };
const APP = arg("app", "impactos");
const SUPER_EMAIL = (arg("super", "") || process.env.SUPER_EMAIL || "").toLowerCase();
const DRY = !arg("run", false);
const LEGACY_COL = "crm_telemarketing";
const LOTE = 400;                               // Firestore admite 500 por lote

if (!admin.apps.length) admin.initializeApp();
const dbReal = admin.firestore();

// CANDADO DE SIMULACIÓN: en --dry cualquier intento de escribir revienta el
// proceso en vez de escribir. No es solo que "no llamemos" a los métodos de
// escritura: aquí no existen.
const bloquear = (m) => () => { throw new Error(`SIMULACIÓN: se intentó escribir (${m}). Abortado, no se tocó Firestore.`); };
const soloLectura = (ref) => new Proxy(ref, {
  get(t, k) {
    if (["set", "create", "update", "delete", "add"].includes(k)) return bloquear(String(k));
    const v = t[k];
    if (typeof v === "function") return (...a) => { const r = v.apply(t, a); return (r && (r.doc || r.get)) ? soloLectura(r) : r; };
    return v;
  },
});
const db = DRY
  ? new Proxy(dbReal, {
      get(t, k) {
        if (k === "batch") return bloquear("batch");
        if (k === "collection") return (n) => soloLectura(t.collection(n));
        const v = t[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    })
  : dbReal;
const log = (...a) => console.log(...a);
const errores = [];

async function main() {
  log(`\n${DRY ? "SIMULACIÓN (no escribe nada)" : "MIGRACIÓN REAL"} — app: ${APP}\n`);

  // 1) Leer el sistema viejo (solo lectura) y rearmar el estado
  const snap = await db.collection(LEGACY_COL).get();
  const docs = {};
  snap.forEach((d) => { const p = d.data()?.payload; if (p !== undefined) docs[d.id] = p; });
  log(`Documentos leídos de ${LEGACY_COL}: ${snap.size}`);
  const estado = joinLegacyDocs(docs);

  // 2) Plan + verificación ANTES de tocar nada
  const plan = planMigration(estado, APP);
  const reporte = verifyMigration(estado, plan, APP);
  log("\n" + formatReport(reporte) + "\n");
  if (!reporte.ok) { log("Los conteos no cuadran. No se escribe nada. Revisa el reporte."); process.exit(1); }

  if (DRY) {
    // Único efecto de la simulación: un archivo de texto LOCAL. Cero escrituras en Firestore.
    fs.writeFileSync(`reporte-migracion-${APP}.txt`, formatReport(reporte));
    log(`Simulación lista — CERO escrituras en Firestore. Reporte: reporte-migracion-${APP}.txt`);
    log(`Para escribir de verdad: node scripts/migrate.mjs --app ${APP} --run`);
    return;
  }

  // 3) Workspace + cursor de avance (permite reanudar)
  const wsRef = db.collection("workspaces").doc(APP);
  await wsRef.set({ nombre: APP, createdAt: new Date().toISOString() }, { merge: true });
  const curRef = wsRef.collection("_migration").doc("v1");
  const cursor = (await curRef.get()).data() || { hechos: {}, iniciado: new Date().toISOString() };
  const hechos = cursor.hechos || {};

  // 4) Escribir por lotes con CREATE: si el documento ya existe, se salta (idempotencia)
  const escribir = async (subcol, items, keyFn) => {
    let creados = 0, saltados = 0;
    for (let i = 0; i < items.length; i += LOTE) {
      const tramo = items.slice(i, i + LOTE);
      const batch = db.batch();
      const enLote = [];
      for (const it of tramo) {
        const key = `${subcol}/${keyFn(it)}`;
        if (hechos[key]) { saltados++; continue; }
        const ref = wsRef.collection(subcol).doc(String(keyFn(it)));
        if ((await ref.get()).exists) { hechos[key] = true; saltados++; continue; }  // nunca sobrescribe
        batch.create(ref, it);
        enLote.push(key);
      }
      if (enLote.length) {
        try {
          await batch.commit();
          enLote.forEach((k) => { hechos[k] = true; });
          creados += enLote.length;
        } catch (e) {
          errores.push({ subcol, desde: i, error: String(e?.message || e) });
          log(`  ⚠️ Falló un lote en ${subcol} (registros ${i}-${i + tramo.length}): ${e?.message}`);
        }
        await curRef.set({ ...cursor, hechos, actualizado: new Date().toISOString() });
      }
      log(`  ${subcol}: ${Math.min(i + LOTE, items.length)}/${items.length}`);
    }
    return { creados, saltados };
  };

  const r1 = await escribir("records", plan.records, (r) => r.id);
  const r2 = await escribir("appts", plan.appts, (a) => a.id || a.legacyId);
  let r3 = 0;
  for (const [k, v] of Object.entries(plan.shared)) {
    const ref = wsRef.collection("shared").doc(k);
    if (!(await ref.get()).exists) { await ref.create({ payload: v }); r3++; }
  }

  // 5) Cuentas actuales → invitaciones (nadie pierde acceso; entran con su Google de siempre)
  let inv = 0;
  for (const c of estado.cuentasCustom || []) {
    const email = String(c?.email || "").trim().toLowerCase();
    if (!email) continue;
    const role = mapLegacyRole(c?.rol, email, SUPER_EMAIL);
    if (role === "super_admin") continue;                 // el Súper Admin se crea a mano, una vez
    const ref = db.collection("invitations").doc(email);
    if ((await ref.get()).exists) continue;
    await ref.create({
      email, emailNormalized: email, nombre: c?.nombre || email, role, appId: APP,
      status: "invited", createdBy: "migracion", createdAt: new Date().toISOString(),
      legacyRole: c?.rol || "",
    });
    inv++;
  }

  await curRef.set({ ...cursor, hechos, terminado: new Date().toISOString(), errores }, { merge: true });
  const texto = formatReport(reporte) +
    `\n\nEscritura:\n  records creados: ${r1.creados} (saltados por existir: ${r1.saltados})` +
    `\n  appts creados: ${r2.creados} (saltados: ${r2.saltados})\n  shared creados: ${r3}\n  invitaciones creadas: ${inv}` +
    `\n  errores: ${errores.length}` + (errores.length ? "\n" + JSON.stringify(errores, null, 2) : "");
  fs.writeFileSync(`reporte-migracion-${APP}.txt`, texto);
  log("\n" + texto);
  log(`\nListo. crm_telemarketing NO fue modificado.`);
}
main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
