// ═══ PUNTO ÚNICO DE PERMISOS PARA TODA LA APP ═════════════════════════════
// App.tsx y los módulos preguntan SIEMPRE aquí: canDo("exportar"), canTab("cobranza").
//
//  • Sistema nuevo (VITE_ACCESS_V2=1): responde can() de permissions.ts.
//  • Sistema actual (producción hoy): responde EXACTAMENTE lo mismo que las
//    funciones viejas. Probado rol por rol en tests/access.test.ts.
//
// En la Entrega 4 se borra la rama "legacy" y queda solo can().
import { can, canViewTab, AppUser, recordScope, RecordSection } from "./permissions";
import { normalizarRol, puedeVerTabRol, puedeExportarRol, puedeCrearIncentivosRol } from "./legacyPermissions";

export type Viewer =
  | { mode: "v2"; user: AppUser }
  | { mode: "legacy"; legacyRole: string };

let current: Viewer = { mode: "legacy", legacyRole: "" };
export const setViewer = (v: Viewer) => { current = v; };
export const getViewer = () => current;
export const viewerUser = (): AppUser => (current.mode === "v2" ? current.user : null);

// Equivalencias con el sistema viejo (solo para el modo actual).
function legacyCan(rol: string, perm: string): boolean {
  const n = normalizarRol(rol);
  switch (perm) {
    case "exportar":
    case "catalogo.edit": return puedeExportarRol(rol);
    case "incentivos.manage": return puedeCrearIncentivosRol(rol);
    case "usuarios.manage":
    case "plantillas.edit": return n === "Distribuidor";
    case "datos.herramientas": return n === "Distribuidor" || n === "Supervisor";
    // En el sistema viejo el resto no se chequeaba: todo usuario autorizado podía.
    default: return true;
  }
}

export function canDo(perm: string, v: Viewer = current): boolean {
  return v.mode === "v2" ? can(v.user, perm) : legacyCan(v.legacyRole, perm);
}
export function canTab(tabId: string, v: Viewer = current): boolean {
  if (v.mode === "v2") return canViewTab(v.user, tabId);
  // Pestañas nuevas no existen en el sistema viejo.
  if (tabId === "usuarios" || tabId === "asignaciones") return false;
  return puedeVerTabRol(v.legacyRole, tabId);
}
// Alcance de datos: en el sistema viejo todo usuario autorizado veía toda la base.
export function scopeOf(section: RecordSection, v: Viewer = current) {
  return v.mode === "v2" ? recordScope(v.user, section) : "all";
}
