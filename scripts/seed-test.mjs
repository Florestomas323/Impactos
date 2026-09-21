#!/usr/bin/env node
/**
 * SIEMBRA DE DATOS SINTÉTICOS — SOLO PROYECTO DE PRUEBA
 *
 *   node scripts/seed-test.mjs --super tu@gmail.com
 *
 * • Se NIEGA a correr contra actividad-royal-prestige (producción).
 * • Crea workspaces/impactos con ~120 registros inventados que imitan los
 *   formatos reales del dry-run (notas como texto, historial como mapa…).
 * • Crea tu perfil de Súper Admin si ya entraste una vez con Google al
 *   proyecto de prueba (si no, te dice que entres primero).
 * • Crea 6 invitaciones de ejemplo para probar cupos.
 * Se puede correr varias veces: no duplica.
 */
import fs from "node:fs";
import admin from "firebase-admin";
import { planMigration } from "../dist-migration/migration.js";

const PROD = "actividad-royal-prestige";
const arg = (n, d = null) => { const i = process.argv.indexOf("--" + n); return i > -1 ? process.argv[i + 1] : d; };
const SUPER = String(arg("super", "") || "").trim().toLowerCase();
const APP = "impactos";

const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
if (!sa.project_id || sa.project_id === PROD) {
  console.error(`⛔ Este script NO corre contra producción (${PROD}). Usa la cuenta de servicio del proyecto de PRUEBA.`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
console.log(`Proyecto de prueba: ${sa.project_id}`);

// ── Datos inventados (nombres y teléfonos ficticios, 555 = no existen) ──
const ciudades = ["Temple", "Killeen", "Belton", "Austin", "Round Rock", "Waco"];
const zips = ["76501", "76541", "76513", "78701", "78664", "76701"];
const estados = ["sin_estado", "naranja", "buzon", "azul", "verde", "rojo"];
const dias = (n) => new Date(Date.now() - n * 86400000).toISOString();
const rec = (p, i, extra = {}) => ({
  id: `${p}${i}`, nombre: `Prueba ${p.toUpperCase()}${i}`, telefono: `25455501${String(i).padStart(2, "0")}`,
  ciudad: ciudades[i % 6], cp: zips[i % 6], estado: estados[i % 6], eliminado: false,
  creado: dias(200 - i), fuente: i % 2 ? "Facebook" : "Referido",
  // Formatos reales del dry-run: notas como TEXTO en muchos registros
  notas: i % 3 === 0 ? `Nota vieja en texto #${i}` : [{ texto: `nota ${i}`, fecha: dias(40 + i), agente: "Prueba" }],
  historial: i % 5 === 0 ? { x: { tipo: "llamada", estado: "buzon", fecha: dias(35 + i) } } : (i % 4 === 0 ? [] : [{ tipo: "llamada", fecha: dias(30 + i) }]),
  ...extra,
});
const estado = {
  agregados: Array.from({ length: 40 }, (_, i) => rec("a", i)),
  prospectos: Array.from({ length: 25 }, (_, i) => rec("p", i)),
  distribucion: Array.from({ length: 20 }, (_, i) => rec("d", i, { cuenta: "TST" + i })),
  referidos: Array.from({ length: 10 }, (_, i) => ({ id: "r" + i, anfitrion: "Anfitrión " + i, estado: "sin_estado", creado: dias(90),
    referidos: [{ nombre: "Ref " + i, telefono: "2545559" + String(i).padStart(3, "0"), notas: i % 2 ? "texto" : [] }] })),
  reclutamiento: Array.from({ length: 12 }, (_, i) => rec("rc", i, { etapa: "contacto" })),
  cobranza: { cfg: { diasGracia: 5 }, clientesData: Object.fromEntries([
    ...Array.from({ length: 15 }, (_, i) => ["d" + i, { saldo: 500 + i * 10, pagoMensual: 60 }]),
    ...Array.from({ length: 3 }, (_, i) => ["hy" + i, { saldo: 300, origen: "reporte Hy Cite" }]),
  ]) },
  appts: Array.from({ length: 6 }, (_, i) => ({ id: "ap" + i, tipo: "cita", fecha: dias(-i).slice(0, 10), cliente: "Prueba A" + i, agente: "Prueba" })),
  incentivos: [], cumpleanos: [], rutas: [], callLog: { [dias(1).slice(0, 10)]: { Prueba: 12 } }, cumpleMsgTpl: "Feliz cumple {nombre}",
};

async function main() {
  const ws = db.collection("workspaces").doc(APP);
  await ws.set({ nombre: "ImpactOS (PRUEBA)", limits: { distribuidor: 2, supervisor: 2, telemarketing_total: 6 }, createdAt: new Date().toISOString() }, { merge: true });
  const plan = planMigration(estado, APP);
  let n = 0;
  for (const r of plan.records) { const ref = ws.collection("records").doc(r.id); if (!(await ref.get()).exists) { await ref.set(r); n++; } }
  for (const a of plan.appts) { const ref = ws.collection("appts").doc(a.id); if (!(await ref.get()).exists) await ref.set(a); }
  for (const [k, v] of Object.entries(plan.shared)) { const ref = ws.collection("shared").doc(k); if (!(await ref.get()).exists) await ref.set({ payload: v }); }
  console.log(`Registros nuevos: ${n} (total en plan: ${plan.records.length}). Formatos raros: ${plan.shapeWarnings.length}.`);

  if (SUPER) {
    try {
      const u = await admin.auth().getUserByEmail(SUPER);
      await db.collection("users").doc(u.uid).set({ email: SUPER, emailNormalized: SUPER, nombre: "Tomas (prueba)", role: "super_admin", appId: APP, status: "active", createdBy: "seed", createdAt: new Date().toISOString(), activatedAt: new Date().toISOString() }, { merge: true });
      console.log(`Súper Admin listo: ${SUPER}`);
    } catch {
      console.log(`⚠️ ${SUPER} todavía no entró al proyecto de prueba. Abre la app de prueba, entra con Google una vez y vuelve a correr este workflow.`);
    }
  }
  console.log("Listo. Nada de producción fue tocado.");
}
main().catch((e) => { console.error(e); process.exit(1); });
