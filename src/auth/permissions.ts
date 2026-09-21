// ═══ PERMISOS CENTRALIZADOS ════════════════════════════════════════════════
// TODA decisión de acceso de la interfaz pasa por can(user, permiso).
// Prohibido escribir role === "..." fuera de src/auth/.
import { Role, isStaff, assignmentTypeOf } from "./roles";

export type AppUser = {
  uid?: string;
  email?: string;
  nombre?: string;
  role?: Role | string;
  appId?: string;
  status?: string;
} | null | undefined;

export const PERMISSIONS: Record<Role, string[]> = {
  super_admin: ["*"],

  distribuidor: [
    "dashboard.view", "clientes.view", "clientes.edit", "llamadas.manage", "llamadas.use",
    "agenda.manage", "servicios.manage", "ventas.manage", "referidos.manage",
    "reclutamiento.view", "reclutamiento.edit", "cobranza.view", "cobranza.edit",
    "equipo.view", "usuarios.manage", "asignaciones.manage", "estadisticas.view",
    "notas.create", "entrevistas.manage", "exportar", "incentivos.manage",
    "catalogo.view", "catalogo.edit", "rutas.manage", "cumpleanos.manage", "config.view",
    "datos.herramientas", "plantillas.edit",
  ],

  supervisor: [
    "dashboard.view", "clientes.view", "clientes.edit", "llamadas.manage", "llamadas.use",
    "agenda.manage", "equipo.view", "asignaciones.manage", "estadisticas.view",
    "notas.create", "exportar", "incentivos.manage", "catalogo.view", "catalogo.edit", "config.view",
    "datos.herramientas",
  ],

  telemarketing_ventas: [
    "dashboard.view", "llamadas.use", "clientes.assigned.view", "clientes.assigned.edit",
    "agenda.manage", "notas.create", "catalogo.view", "config.view",
  ],

  telemarketing_cobranza: [
    "dashboard.view", "cobranza.view", "cobranza.edit", "clientes_distribucion.assigned.view",
    "llamadas.use", "notas.create", "agenda.manage", "config.view",
  ],

  telemarketing_reclutamiento: [
    "dashboard.view", "reclutamiento.assigned.view", "reclutamiento.assigned.edit",
    "llamadas.use", "notas.create", "entrevistas.manage", "agenda.manage", "config.view",
  ],
};

const isActive = (u: AppUser) => !!u && u.status === "active" && !!PERMISSIONS[u.role as Role];

// can(user, "clientes.view") → true/false. Usuario no activo = nada.
export function can(user: AppUser, permission: string): boolean {
  if (!isActive(user)) return false;
  const list = PERMISSIONS[user!.role as Role];
  if (list.includes("*")) return true;
  if (list.includes(permission)) return true;
  // comodín por grupo: "cobranza.*"
  const grupo = permission.split(".")[0] + ".*";
  return list.includes(grupo);
}
export const canAny = (user: AppUser, perms: string[]) => perms.some((p) => can(user, p));

// Alcance de datos por sección: "all" (toda su app), "assigned" (solo lo suyo) o "none".
// Es el MISMO criterio que aplican las Firestore Rules.
export type Scope = "all" | "assigned" | "none";
export const RECORD_SECTIONS = ["agregados", "referidos", "prospectos", "distribucion", "cobranza", "reclutamiento", "appts"] as const;
export type RecordSection = (typeof RECORD_SECTIONS)[number];

const SECTIONS_BY_TYPE: Record<string, RecordSection[]> = {
  ventas: ["agregados", "referidos", "prospectos", "appts"],
  cobranza: ["cobranza", "distribucion", "appts"],
  reclutamiento: ["reclutamiento", "appts"],
};

export function recordScope(user: AppUser, section: RecordSection): Scope {
  if (!isActive(user)) return "none";
  if (user!.role === "super_admin" || isStaff(user!.role)) return "all";
  const tipo = assignmentTypeOf(user!.role);
  if (!tipo) return "none";
  return SECTIONS_BY_TYPE[tipo].includes(section) ? "assigned" : "none";
}

// Pestañas del menú → permiso(s) que las abren (basta con uno).
export const TAB_PERMISSIONS: Record<string, string[]> = {
  inicio: ["dashboard.view"],
  llamadas: ["llamadas.use", "llamadas.manage"],
  agenda: ["agenda.manage"],
  servicio: ["servicios.manage"],
  agregados: ["clientes.view", "clientes.assigned.view"],
  referidos: ["referidos.manage", "clientes.view", "clientes.assigned.view"],
  prospectos: ["clientes.view", "clientes.assigned.view"],
  distribucion: ["clientes.view", "clientes_distribucion.assigned.view"],
  reclutamiento: ["reclutamiento.view", "reclutamiento.assigned.view"],
  cobranza: ["cobranza.view"],
  catalogo: ["catalogo.view"],
  simulador: ["catalogo.view"],
  rutas: ["rutas.manage"],
  cumpleanos: ["cumpleanos.manage"],
  incentivo: ["incentivos.manage"],
  control: ["estadisticas.view"],
  stats: ["estadisticas.view"],
  equipo: ["equipo.view"],
  asignaciones: ["asignaciones.manage"],
  usuarios: ["usuarios.manage"],
  config: ["config.view"],
};
export function canViewTab(user: AppUser, tabId: string): boolean {
  const perms = TAB_PERMISSIONS[tabId];
  if (!perms) return can(user, "*"); // pestaña desconocida: solo Súper Admin
  return canAny(user, perms);
}

// ¿Qué roles puede invitar/gestionar este usuario?
export function manageableRoles(user: AppUser): Role[] {
  if (!can(user, "usuarios.manage")) return [];
  if (user!.role === "super_admin") {
    return ["distribuidor", "supervisor", "telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
  }
  // Distribuidor: solo equipo operativo de su app. Nunca otro distribuidor ni Súper Admin.
  return ["supervisor", "telemarketing_ventas", "telemarketing_cobranza", "telemarketing_reclutamiento"];
}
