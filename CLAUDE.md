# Notas para asistentes de código

- Monorepo pnpm: `packages/shared`, `apps/server`, `apps/web`. Lee `docs/ARCHITECTURE.md` antes de añadir funcionalidad.
- Todo el texto de la interfaz y los comentarios van en español.
- Debe correr en una Raspberry Pi 5 (arm64): evita dependencias nativas pesadas y servicios externos.
- Nuevas funcionalidades = nuevo módulo en `apps/server/src/modules/` y `apps/web/src/modules/`, con sus eventos en `packages/shared/src/realtime.ts`.
- Lo oculto a jugadores se filtra en el servidor, nunca solo en el cliente.
- Antes de subir: `pnpm typecheck && pnpm test && pnpm build`.
- Cambios de esquema: editar `apps/server/src/db/schema.ts` y ejecutar `pnpm db:generate`.
