# Arquitectura ImpactOS — Fase 1

Objetivo: eliminar el monolito histórico de App.tsx sin cambiar el comportamiento visible.

- `modules/`: áreas funcionales (llamadas, agenda, cobranza, reclutamiento, clientes, prospectos, etc.).
- `auth/`: autenticación, roles y permisos.
- `firebase/`: configuración, persistencia, sincronización y migraciones.
- `ai/`: integraciones y extractores IA.
- `components/`: UI reutilizable.
- `hooks/`: hooks compartidos.
- `utils/`: funciones puras compartidas.

## Regla
No se agrega nueva lógica de negocio a `App.tsx`. Todo cambio nuevo debe entrar en el módulo correspondiente.
