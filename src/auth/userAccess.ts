// ═══ ACCESO CON GOOGLE + users/ + invitations/ ═════════════════════════════
// Google Login sigue igual. Lo que cambia es QUIÉN decide si entras:
// ya no una lista de correos en el código, sino Firestore.
//
//  1. ¿Existe users/{uid}?  → activo: entra.  inactive/suspended: fuera.
//  2. Si no, ¿hay invitación pendiente para su correo?  → se acepta en UN lote:
//     nace users/{uid} con el rol y la app de la invitación, y la invitación
//     queda "accepted". Las Rules verifican que coincidan.
//  3. Si no hay nada: "sin acceso".
import { normalizeEmail, isRole } from "./roles";
import type { AppUser } from "./permissions";

export type AccessResult =
  | { status: "ok"; user: AppUser & { uid: string } }
  | { status: "inactive"; user: AppUser & { uid: string } }
  | { status: "no_invite"; email: string }
  | { status: "error"; message: string };

const nowISO = () => new Date().toISOString();

export async function resolveAccess(db: any, authUser: { uid: string; email?: string | null; displayName?: string | null }): Promise<AccessResult> {
  const uid = authUser?.uid;
  const email = normalizeEmail(authUser?.email);
  if (!uid || !email) return { status: "error", message: "La cuenta de Google no tiene correo." };
  try {
    const ref = db.collection("users").doc(uid);
    const snap = await ref.get();
    if (snap.exists) {
      const u = { uid, ...snap.data() };
      if (u.status === "active" && isRole(u.role)) return { status: "ok", user: u };
      return { status: "inactive", user: u };
    }
    const invRef = db.collection("invitations").doc(email);
    const inv = await invRef.get();
    if (!inv.exists || inv.data()?.status !== "invited") return { status: "no_invite", email };
    const i = inv.data();
    const perfil = {
      email: authUser.email || email,
      emailNormalized: email,
      nombre: i.nombre || authUser.displayName || email,
      role: i.role,
      appId: i.appId,
      status: "active",
      createdBy: i.createdBy || "",
      createdAt: i.createdAt || nowISO(),
      activatedAt: nowISO(),
      lastActiveAt: nowISO(),
    };
    const batch = db.batch();
    batch.set(ref, perfil);
    batch.update(invRef, { status: "accepted", acceptedUid: uid, acceptedAt: nowISO() });
    await batch.commit();
    return { status: "ok", user: { uid, ...perfil } };
  } catch (e: any) {
    const code = String(e?.code || "");
    if (code.includes("permission-denied")) {
      return { status: "error", message: "Firestore rechazó el acceso. Si acabas de ser invitado, pídele al administrador que revise tu invitación." };
    }
    return { status: "error", message: "No se pudo verificar tu acceso. Revisa tu conexión e inténtalo de nuevo." };
  }
}

// Escucha el perfil: si el administrador te desactiva, la app lo sabe al instante.
export function watchProfile(db: any, uid: string, cb: (u: any | null) => void): () => void {
  return db.collection("users").doc(uid).onSnapshot(
    (s: any) => cb(s.exists ? { uid, ...s.data() } : null),
    () => cb(null),
  );
}

// "Última actividad": como mucho una escritura cada 10 minutos.
let ultimaMarca = 0;
export async function touchLastActive(db: any, uid: string) {
  const ahora = Date.now();
  if (ahora - ultimaMarca < 10 * 60 * 1000) return;
  ultimaMarca = ahora;
  try { await db.collection("users").doc(uid).update({ lastActiveAt: new Date().toISOString() }); } catch { /* sin conexión: no pasa nada */ }
}

// Al perder el acceso: se borra la copia local de la base en este teléfono.
export async function purgeLocalData() {
  try { localStorage.removeItem("crm_fb_v1"); } catch {}
  try { localStorage.removeItem("impactos_v2_cache"); } catch {}
  try {
    const dbs: any[] = (await (indexedDB as any).databases?.()) || [];
    await Promise.all(dbs.map((d) => d?.name && (/firestore|impactos|crm/i.test(d.name)) && new Promise((r) => {
      const req = indexedDB.deleteDatabase(d.name); req.onsuccess = req.onerror = req.onblocked = () => r(null);
    })));
  } catch {}
}
