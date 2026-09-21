// ═══ CLIENTE DE /api/users ════════════════════════════════════════════════
// Toda operación que ocupa o libera cupo pasa por el servidor, que recuenta
// los miembros reales en una transacción. La app solo pide; no decide.
import type { Role } from "../auth/roles";

export type UsersAction =
  | { action: "invite"; email: string; nombre: string; role: Role; appId: string }
  | { action: "revokeInvitation"; email: string }
  | { action: "changeRole"; uid: string; role: Role }
  | { action: "setStatus"; uid: string; status: "active" | "inactive" | "suspended" }
  | { action: "moveApp"; uid: string; appId: string }
  | { action: "rename"; uid: string; nombre: string };

export async function callUsersApi(getIdToken: () => Promise<string>, body: UsersAction): Promise<{ ok: boolean; message: string; data?: any }> {
  let token = "";
  try { token = await getIdToken(); } catch { return { ok: false, message: "Tu sesión expiró. Vuelve a entrar." }; }
  try {
    const r = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok !== false, message: j.message || (r.ok ? "Listo." : "No se pudo completar."), data: j.data };
  } catch {
    return { ok: false, message: "Sin conexión con el servidor. Inténtalo de nuevo." };
  }
}
