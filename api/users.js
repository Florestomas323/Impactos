// ═══ /api/users — administración de usuarios de ImpactOS ═══════════════════
// Apagado por defecto: responde 503 salvo que el proyecto de Vercel tenga
// ACCESS_V2_API=1. En producción NO está definido hasta la Entrega 4.
//
// Variables en Vercel (solo en el proyecto de prueba por ahora):
//   ACCESS_V2_API=1
//   FIREBASE_SERVICE_ACCOUNT = JSON completo de la cuenta de servicio
import admin from "firebase-admin";
import { runAction, loadCaller, ApiError } from "./_lib/usersCore.js";

function initAdmin() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new ApiError(500, "Falta FIREBASE_SERVICE_ACCOUNT en el servidor.");
  let cred;
  try { cred = JSON.parse(raw); } catch { throw new ApiError(500, "FIREBASE_SERVICE_ACCOUNT no es un JSON válido."); }
  admin.initializeApp({ credential: admin.credential.cert(cred) });
}

export default async function handler(req, res) {
  if (process.env.ACCESS_V2_API !== "1") return res.status(503).json({ ok: false, message: "Administración de usuarios v2 no habilitada en este entorno." });
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Método no permitido." });
  try {
    initAdmin();
    const m = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!m) throw new ApiError(401, "Falta la sesión.");
    const token = await admin.auth().verifyIdToken(m[1], true).catch(() => { throw new ApiError(401, "Sesión inválida o expirada."); });
    const db = admin.firestore();
    const caller = await loadCaller(db, token.uid);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const out = await runAction(db, caller, body);
    // Desactivar/suspender: se cierran también sus sesiones abiertas.
    if (out?.revoke && body.uid) await admin.auth().revokeRefreshTokens(body.uid).catch(() => {});
    return res.status(200).json({ ok: true, message: out?.message || "Listo." });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    const message = e instanceof ApiError ? e.message : "Error interno. Inténtalo de nuevo.";
    if (!(e instanceof ApiError)) console.error("[api/users]", e);
    return res.status(status).json({ ok: false, message });
  }
}
