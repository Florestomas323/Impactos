// ═══ APPS / WORKSPACES Y LÍMITES DE PUESTOS ════════════════════════════════
import { DEFAULT_LIMITS, Limits, Role, SEAT_STATUSES, isTelemarketing } from "./roles";

export type SeatCounts = Record<string, number>;

// Cuenta puestos ocupados a partir de usuarios + invitaciones pendientes.
// (Una invitación pendiente YA ocupa puesto: si no, se podrían invitar 10.)
export function countSeats(
  members: Array<{ role?: string; status?: string; appId?: string }>,
  appId: string
): SeatCounts {
  const c: SeatCounts = {};
  (members || []).forEach((m) => {
    if (!m || m.appId !== appId) return;
    if (m.role === "super_admin") return; // global: no cuenta
    if (!SEAT_STATUSES.includes(m.status as any)) return;
    c[m.role as string] = (c[m.role as string] || 0) + 1;
  });
  return c;
}

export const telemarketingTotal = (c: SeatCounts) =>
  (c.telemarketing_ventas || 0) + (c.telemarketing_cobranza || 0) + (c.telemarketing_reclutamiento || 0);

export type SeatCheck = { ok: boolean; message: string };

// ¿Cabe un usuario MÁS con este rol? Mensaje claro si no.
export function checkSeat(counts: SeatCounts, role: Role, limits: Partial<Limits> = {}): SeatCheck {
  const L: Limits = { ...DEFAULT_LIMITS, ...limits };
  const c = counts || {};
  if (role === "super_admin") {
    return { ok: false, message: "No se puede crear otro Súper Admin desde la app." };
  }
  if (role === "distribuidor" && (c.distribuidor || 0) >= L.distribuidor) {
    return { ok: false, message: `Esta app ya tiene ${L.distribuidor} distribuidores (límite alcanzado).` };
  }
  if (role === "supervisor" && (c.supervisor || 0) >= L.supervisor) {
    return { ok: false, message: `Esta app ya tiene ${L.supervisor} supervisores (límite alcanzado).` };
  }
  // Cupo ÚNICO de telemarketing: cualquier reparto entre las tres especialidades.
  if (isTelemarketing(role) && telemarketingTotal(c) >= L.telemarketing_total) {
    return { ok: false, message: `Esta app ya tiene ${L.telemarketing_total} usuarios de telemarketing (cupo total alcanzado). Desactiva a alguien o cambia su rol.` };
  }
  return { ok: true, message: "" };
}

// Cambio de rol: libera el puesto viejo y pide el nuevo.
export function checkRoleChange(counts: SeatCounts, from: Role, to: Role, limits: Partial<Limits> = {}): SeatCheck {
  if (from === to) return { ok: true, message: "" };
  const c = { ...(counts || {}) };
  c[from] = Math.max(0, (c[from] || 0) - 1);
  return checkSeat(c, to, limits);
}
