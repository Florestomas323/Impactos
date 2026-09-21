// ═══ LÓGICA DE /api/users (sin HTTP, probada en tests/usersApi.test.mjs) ═══
// Recibe una base de datos con la interfaz de firebase-admin. Toda operación
// que ocupa cupo corre en una TRANSACCIÓN que vuelve a contar los miembros
// REALES del workspace (users + invitaciones pendientes) antes de escribir.
// Ningún número que venga del teléfono participa en la decisión.

export const ROLES = ["distribuidor", "supervisor", "telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
const OPERATIVOS = ["supervisor", "telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
const TM = ["telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
const SEAT_STATUSES = ["invited", "active", "suspended"];
export const DEFAULT_LIMITS = { distribuidor: 2, supervisor: 2, telemarketing_total: 6 };

export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const norm = (e) => String(e || "").trim().toLowerCase();
const nowISO = () => new Date().toISOString();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/;

// ── Cupos ───────────────────────────────────────────────────────────────────
export function countSeats(members) {
  const c = {};
  members.forEach((m) => {
    if (!m || m.role === "super_admin" || !SEAT_STATUSES.includes(m.status)) return;
    c[m.role] = (c[m.role] || 0) + 1;
  });
  return c;
}
const tmTotal = (c) => TM.reduce((a, r) => a + (c[r] || 0), 0);
export function checkSeat(c, role, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  if (!ROLES.includes(role)) return "Rol inválido.";
  if (role === "distribuidor" && (c.distribuidor || 0) >= L.distribuidor) return `Esta app ya tiene ${L.distribuidor} distribuidores (límite alcanzado).`;
  if (role === "supervisor" && (c.supervisor || 0) >= L.supervisor) return `Esta app ya tiene ${L.supervisor} supervisores (límite alcanzado).`;
  if (TM.includes(role) && tmTotal(c) >= L.telemarketing_total) return `Esta app ya tiene ${L.telemarketing_total} usuarios de telemarketing (cupo total alcanzado). Desactiva a alguien o cambia su rol.`;
  return "";
}

// Lee DENTRO de la transacción todos los miembros reales del workspace.
async function seatsIn(t, db, appId, excludeUid = null) {
  const us = await t.get(db.collection("users").where("appId", "==", appId));
  const inv = await t.get(db.collection("invitations").where("appId", "==", appId).where("status", "==", "invited"));
  const ws = await t.get(db.collection("workspaces").doc(appId));
  const members = [];
  us.docs.forEach((d) => { if (d.id !== excludeUid) members.push(d.data()); });
  inv.docs.forEach((d) => members.push(d.data()));
  return { counts: countSeats(members), limits: (ws.exists && ws.data().limits) || {}, wsExists: ws.exists, wsRef: ws.ref || db.collection("workspaces").doc(appId) };
}
function mirrorCounts(t, wsRef, counts) {
  // Espejo SOLO para mostrar en pantalla. La validación nunca lo lee.
  t.set(wsRef, { counts, countsAt: nowISO() }, { merge: true });
}
function audit(t, db, appId, entry) {
  t.set(db.collection("workspaces").doc(appId).collection("audit").doc(), { ...entry, at: nowISO() });
}

// ── Quién llama ─────────────────────────────────────────────────────────────
export async function loadCaller(db, uid) {
  const s = await db.collection("users").doc(uid).get();
  if (!s.exists) fail(403, "Tu cuenta no tiene perfil en ImpactOS.");
  const u = { uid, ...s.data() };
  if (u.status !== "active") fail(403, "Tu cuenta no está activa.");
  if (!["super_admin", "distribuidor"].includes(u.role)) fail(403, "Tu rol no puede administrar usuarios.");
  return u;
}
// ¿Puede el que llama tocar a este usuario/rol en esta app?
function assertCanManage(caller, { appId, role, targetRole }) {
  if (caller.role === "super_admin") {
    if (role === "super_admin" || targetRole === "super_admin") fail(403, "No se puede crear ni modificar otro Súper Admin.");
    return;
  }
  if (appId !== caller.appId) fail(403, "Solo puedes administrar usuarios de tu propia app.");
  if (role && !OPERATIVOS.includes(role)) fail(403, "Un distribuidor solo puede asignar roles del equipo operativo.");
  if (targetRole && !OPERATIVOS.includes(targetRole)) fail(403, "No puedes modificar a un distribuidor ni al Súper Admin.");
}

// ── Acciones ────────────────────────────────────────────────────────────────
export async function runAction(db, caller, body) {
  const a = body?.action;
  if (a === "invite") return invite(db, caller, body);
  if (a === "revokeInvitation") return revokeInvitation(db, caller, body);
  if (a === "changeRole") return changeRole(db, caller, body);
  if (a === "setStatus") return setStatus(db, caller, body);
  if (a === "moveApp") return moveApp(db, caller, body);
  if (a === "rename") return rename(db, caller, body);
  fail(400, "Acción desconocida.");
}

async function invite(db, caller, { email, nombre, role, appId }) {
  const e = norm(email);
  if (!EMAIL_RE.test(e)) fail(400, "Correo inválido.");
  if (!ROLES.includes(role)) fail(400, "Rol inválido.");
  const app = caller.role === "super_admin" ? String(appId || "") : caller.appId;
  if (!APP_RE.test(app)) fail(400, "App inválida.");
  assertCanManage(caller, { appId: app, role });
  return db.runTransaction(async (t) => {
    const yaUser = await t.get(db.collection("users").where("emailNormalized", "==", e));
    if (!yaUser.empty) fail(409, "Ese correo ya tiene cuenta en ImpactOS. Edítala en lugar de invitarla.");
    const invRef = db.collection("invitations").doc(e);
    const inv = await t.get(invRef);
    if (inv.exists && inv.data().status === "invited") fail(409, "Ese correo ya tiene una invitación pendiente.");
    const s = await seatsIn(t, db, app);
    if (!s.wsExists && caller.role !== "super_admin") fail(404, "La app no existe.");
    const msg = checkSeat(s.counts, role, s.limits);
    if (msg) fail(409, msg);
    t.set(invRef, {
      email: String(email).trim(), emailNormalized: e, nombre: String(nombre || e).trim().slice(0, 80),
      role, appId: app, status: "invited", createdBy: caller.uid, createdAt: nowISO(),
    });
    const counts = { ...s.counts, [role]: (s.counts[role] || 0) + 1 };
    mirrorCounts(t, s.wsRef, counts);
    audit(t, db, app, { action: "invite", email: e, role, byUid: caller.uid });
    return { message: `Invitación creada para ${e}. Que entre con Google usando ese correo.` };
  });
}

async function revokeInvitation(db, caller, { email }) {
  const e = norm(email);
  return db.runTransaction(async (t) => {
    const ref = db.collection("invitations").doc(e);
    const s0 = await t.get(ref);
    if (!s0.exists || s0.data().status !== "invited") fail(404, "No hay invitación pendiente para ese correo.");
    const inv = s0.data();
    assertCanManage(caller, { appId: inv.appId, targetRole: inv.role });
    const s = await seatsIn(t, db, inv.appId);
    t.update(ref, { status: "revoked", updatedAt: nowISO(), updatedBy: caller.uid });
    mirrorCounts(t, s.wsRef, { ...s.counts, [inv.role]: Math.max(0, (s.counts[inv.role] || 0) - 1) });
    audit(t, db, inv.appId, { action: "revokeInvitation", email: e, byUid: caller.uid });
    return { message: "Invitación revocada." };
  });
}

async function loadTarget(t, db, uid) {
  const ref = db.collection("users").doc(String(uid || ""));
  const s = await t.get(ref);
  if (!s.exists) fail(404, "Ese usuario no existe.");
  return { ref, u: s.data() };
}

async function changeRole(db, caller, { uid, role }) {
  if (!ROLES.includes(role)) fail(400, "Rol inválido.");
  if (uid === caller.uid) fail(400, "No puedes cambiar tu propio rol.");
  return db.runTransaction(async (t) => {
    const { ref, u } = await loadTarget(t, db, uid);
    assertCanManage(caller, { appId: u.appId, role, targetRole: u.role });
    if (u.role === role) return { message: "Sin cambios." };
    const s = await seatsIn(t, db, u.appId, uid);             // sin contarse a sí mismo
    if (SEAT_STATUSES.includes(u.status)) {
      const msg = checkSeat(s.counts, role, s.limits);
      if (msg) fail(409, msg);
    }
    t.update(ref, { role, updatedAt: nowISO(), updatedBy: caller.uid });
    const counts = { ...s.counts };
    if (SEAT_STATUSES.includes(u.status)) counts[role] = (counts[role] || 0) + 1;
    mirrorCounts(t, s.wsRef, counts);
    audit(t, db, u.appId, { action: "changeRole", uid, from: u.role, to: role, byUid: caller.uid });
    return { message: "Rol actualizado." };
  });
}

async function setStatus(db, caller, { uid, status }) {
  if (!["active", "inactive", "suspended"].includes(status)) fail(400, "Estado inválido.");
  if (uid === caller.uid) fail(400, "No puedes cambiar tu propio estado.");
  return db.runTransaction(async (t) => {
    const { ref, u } = await loadTarget(t, db, uid);
    assertCanManage(caller, { appId: u.appId, targetRole: u.role });
    if (u.status === status) return { message: "Sin cambios." };
    const s = await seatsIn(t, db, u.appId, uid);
    // Volver a ocupar cupo (desde inactive) exige que haya lugar.
    if (SEAT_STATUSES.includes(status) && !SEAT_STATUSES.includes(u.status)) {
      const msg = checkSeat(s.counts, u.role, s.limits);
      if (msg) fail(409, msg);
    }
    t.update(ref, { status, updatedAt: nowISO(), updatedBy: caller.uid });
    const counts = { ...s.counts };
    if (SEAT_STATUSES.includes(status)) counts[u.role] = (counts[u.role] || 0) + 1;
    mirrorCounts(t, s.wsRef, counts);
    audit(t, db, u.appId, { action: "setStatus", uid, from: u.status, to: status, byUid: caller.uid });
    return { message: status === "active" ? "Usuario activado." : status === "inactive" ? "Usuario desactivado: pierde el acceso al instante." : "Usuario suspendido.", revoke: status !== "active" };
  });
}

async function moveApp(db, caller, { uid, appId }) {
  if (caller.role !== "super_admin") fail(403, "Solo el Súper Admin mueve usuarios entre apps.");
  const destino = String(appId || "");
  if (!APP_RE.test(destino)) fail(400, "App inválida.");
  return db.runTransaction(async (t) => {
    const { ref, u } = await loadTarget(t, db, uid);
    assertCanManage(caller, { appId: u.appId, targetRole: u.role });
    if (u.appId === destino) return { message: "Ya pertenece a esa app." };
    // No se mueve a nadie con datos asignados: primero se retiran o reasignan.
    const asignados = await t.get(db.collection("workspaces").doc(u.appId).collection("records").where("assignedTo", "==", uid).limit(1));
    if (!asignados.empty) fail(409, "Tiene registros asignados en su app actual. Retíralos o reasígnalos primero (Equipo → Distribución de datos).");
    const dest = await seatsIn(t, db, destino);
    if (!dest.wsExists) fail(404, "La app destino no existe.");
    const orig = await seatsIn(t, db, u.appId, uid);
    if (SEAT_STATUSES.includes(u.status)) {
      const msg = checkSeat(dest.counts, u.role, dest.limits);
      if (msg) fail(409, `En la app destino: ${msg}`);
    }
    t.update(ref, { appId: destino, updatedAt: nowISO(), updatedBy: caller.uid });
    mirrorCounts(t, orig.wsRef, orig.counts);
    const dc = { ...dest.counts }; if (SEAT_STATUSES.includes(u.status)) dc[u.role] = (dc[u.role] || 0) + 1;
    mirrorCounts(t, dest.wsRef, dc);
    audit(t, db, u.appId, { action: "moveApp", uid, to: destino, byUid: caller.uid });
    audit(t, db, destino, { action: "moveApp", uid, from: u.appId, byUid: caller.uid });
    return { message: `Usuario movido a ${destino}.` };
  });
}

async function rename(db, caller, { uid, nombre }) {
  const n = String(nombre || "").trim().slice(0, 80);
  if (!n) fail(400, "Nombre vacío.");
  return db.runTransaction(async (t) => {
    const { ref, u } = await loadTarget(t, db, uid);
    if (uid !== caller.uid) assertCanManage(caller, { appId: u.appId, targetRole: u.role });
    t.update(ref, { nombre: n, updatedAt: nowISO(), updatedBy: caller.uid });
    return { message: "Nombre actualizado." };
  });
}
