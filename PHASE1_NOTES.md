# ImpactOS — Fase 1 (base modular)

Esta versión inicia la estabilización y modularización sin cambiar intencionalmente la UI.

## Cambios realizados
- Corregido el endpoint duplicado/mal escrito de Anthropic: la implementación queda en `api/anthropic.js`; se elimina `api/antropic.js`.
- Cobranza extraída del monolito a `src/modules/collections/CobranzaSection.tsx`.
- Catálogo/Simulador extraídos a `src/modules/catalog/CatalogModule.tsx`.
- Tema visual centralizado en `src/theme.ts`.
- Primitivas UI compartidas movidas a `src/components/primitives.tsx`.
- Roles/permisos movidos a `src/auth/permissions.ts`.
- Cuentas/autorización movidas a `src/auth/accounts.ts`.
- Utilidades de historial e IDs movidas a `src/utils/history.ts` y `src/utils/ids.ts`.
- Creada estructura de carpetas para todos los módulos restantes de ImpactOS.

## Validación
Se ejecutó `tsc --noEmit` con el TypeScript global. El proyecto original ya usa TypeScript no estricto y no trae dependencias instaladas, por lo que aparecen numerosos errores de tipado heredados y avisos por módulos npm ausentes. Después de corregir errores sintácticos introducidos durante la extracción, no quedan errores de sintaxis ni referencias nuevas sin definir detectadas por el chequeo filtrado.

## Próximo paso dentro de Fase 1
Continuar extrayendo de `App.tsx` los bloques restantes: llamadas, agenda, clientes, prospectos, distribución, reclutamiento, dashboard, incentivos, rutas, servicios, reportes, importadores, configuración, notificaciones, Firebase/sync y autenticación UI, manteniendo el mismo comportamiento.
