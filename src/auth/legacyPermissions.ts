// ═══ PERMISOS DEL SISTEMA ANTERIOR — SOLO COMPATIBILIDAD ═══════════════════
// Copia literal del permissions.ts viejo. Lo usan únicamente:
//   • el modo actual de producción (VITE_ACCESS_V2 apagado), vía src/auth/access.ts
//   • el panel viejo de usuarios de Configuración
// Se BORRA en la Entrega 4, con el corte.
export const ROLES_APP = ["Distribuidor","Supervisor","Telemarketing","Cobranza","Reclutador"];
export const normalizarRol = (r) => {
  const x = String(r||"").toLowerCase();
  if(x.includes("distribuidor")||x.includes("administrador")||x.includes("administradora")||x==="admin") return "Distribuidor";
  if(x.includes("supervis")) return "Supervisor";
  if(x.includes("telemarket")||x.includes("agente")||x.includes("asistente")) return "Telemarketing";
  if(x.includes("cobran")) return "Cobranza";
  if(x.includes("reclut")) return "Reclutador";
  return "Telemarketing"; // rol desconocido → básico
};
export const PERMISOS_ROL = {
  Distribuidor:  { tabs:"*",                                     exportar:true,  crearIncentivos:true  },
  Supervisor:    { tabs:"*",                                     exportar:true,  crearIncentivos:true  },
  Telemarketing: { tabs:"*", excepto:["cobranza"],               exportar:false, crearIncentivos:false },
  Cobranza:      { tabs:["inicio","cobranza","agenda"],          exportar:false, crearIncentivos:false },
  Reclutador:    { tabs:["inicio","reclutamiento","agenda"],     exportar:false, crearIncentivos:false },
};
export const puedeVerTabRol = (rol, tabId) => {
  const p = PERMISOS_ROL[normalizarRol(rol)] || PERMISOS_ROL.Telemarketing;
  if(p.tabs === "*") return !(p.excepto||[]).includes(tabId);
  return p.tabs.includes(tabId);
};
export const puedeExportarRol = (rol) => (PERMISOS_ROL[normalizarRol(rol)]||{}).exportar === true;
export const puedeCrearIncentivosRol = (rol) => (PERMISOS_ROL[normalizarRol(rol)]||{}).crearIncentivos === true;

