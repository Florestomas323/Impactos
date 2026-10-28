#!/usr/bin/env node
/**
 * CUENTA QA — SOLO PROYECTO DE PRUEBA
 *
 *   node scripts/qa-account.mjs   (también corre como último paso de «Prueba — sembrar datos sintéticos»)
 *
 * Deja la cuenta QA lista para entrar por el MISMO camino que un usuario de Google:
 *   1. Marca el correo de la cuenta QA como verificado en Firebase Auth
 *      (las Rules exigen email_verified para aceptar una invitación; un .test
 *      no puede recibir el correo de verificación).
 *   2. Crea su invitación con la misma lógica de /api/users (cupos incluidos),
 *      firmada por el Súper Admin de prueba.
 *   Al primer login, la app acepta la invitación y nace users/{uid} con el rol.
 *
 * • Se NIEGA a correr contra actividad-royal-prestige (producción).
 * • Solo toca la cuenta QA. No modifica, reasigna ni borra a nadie más.
 * • Se puede correr varias veces: si ya tiene perfil o invitación, no hace nada.
 */
import fs from "node:fs";
import admin from "firebase-admin";
import { runAction } from "../api/_lib/usersCore.js";

const PROD = "actividad-royal-prestige";
const QA_EMAIL = "qa@impactos.test";
const QA_ROLE = "distribuidor"; // referidos, citas, ventas y distribución (supervisor no tiene ventas ni referidos)
const APP = "impactos";

const sa = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
if (!sa.project_id || sa.project_id === PROD) {
  console.error(`⛔ Este script NO corre contra producción (${PROD}). Usa la cuenta de servicio del proyecto de PRUEBA.`);
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
console.log(`Proyecto de prueba: ${sa.project_id}`);

async function main() {
  // 1) La cuenta QA debe existir en Auth (la creaste tú en la consola).
  let qa;
  try { qa = await admin.auth().getUserByEmail(QA_EMAIL); }
  catch { console.error(`⛔ ${QA_EMAIL} no existe en Firebase Auth de ${sa.project_id}.`); process.exit(1); }
  const providers = (qa.providerData || []).map((p) => p.providerId);
  if (!providers.includes("password")) { console.error(`⛔ ${QA_EMAIL} no es una cuenta de correo y contraseña (${providers.join(", ")}).`); process.exit(1); }

  // 2) ¿Ya tiene perfil? Entonces no se toca nada.
  const perfil = await db.collection("users").doc(qa.uid).get();
  if (perfil.exists) {
    const p = perfil.data();
    console.log(`ℹ️ ${QA_EMAIL} ya tiene perfil: rol ${p.role}, app ${p.appId}, estado ${p.status}. No se cambió nada.`);
    if (!qa.emailVerified) await admin.auth().updateUser(qa.uid, { emailVerified: true });
    return;
  }

  // 3) Verificado (solo esta cuenta).
  if (!qa.emailVerified) { await admin.auth().updateUser(qa.uid, { emailVerified: true }); console.log("✔ Correo QA marcado como verificado."); }
  else console.log("✔ Correo QA ya estaba verificado.");

  // 4) Invitación pendiente: no se duplica.
  const inv = await db.collection("invitations").doc(QA_EMAIL).get();
  if (inv.exists && inv.data().status === "invited") {
    console.log(`ℹ️ Ya hay invitación pendiente: rol ${inv.data().role}, app ${inv.data().appId}. Entra con la cuenta QA.`);
    return;
  }

  // 5) Firma el Súper Admin de prueba (el que creó la siembra).
  const supers = await db.collection("users").where("role", "==", "super_admin").where("status", "==", "active").limit(1).get();
  if (supers.empty) { console.error("⛔ No hay Súper Admin activo en el proyecto de prueba. Corre primero «Prueba — sembrar datos sintéticos»."); process.exit(1); }
  const caller = { uid: supers.docs[0].id, ...supers.docs[0].data() };

  // Misma lógica que /api/users: transacción, cupos reales, auditoría.
  const out = await runAction(db, caller, { action: "invite", email: QA_EMAIL, nombre: "QA Pruebas", role: QA_ROLE, appId: APP });
  console.log("✔ " + out.message.replace("con Google", "con su correo y contraseña"));
  console.log("Listo. Nada de producción fue tocado.");
}
main().catch((e) => { console.error("⛔ " + (e?.message || e)); process.exit(1); });
