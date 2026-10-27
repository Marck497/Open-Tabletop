# Notas para asistentes de código

- Monorepo pnpm: `packages/shared`, `apps/server`, `apps/web`. Lee `docs/ARCHITECTURE.md` antes de añadir funcionalidad.
- Los comentarios van en español. El texto de la interfaz se escribe en español dentro de `tr('…')` (web: `core/i18n`; servidor y shared: `@vtt/shared`) y su versión en inglés se añade en `packages/shared/src/i18n/en/`. El test `packages/shared/test/i18n.test.ts` falla si falta alguna.
- Los datos (etiquetas de la plantilla, estados, tipos de daño, nombres del SRD) se guardan en español y se traducen al mostrarlos con `tr()` o `localName()`. No compares con un texto ya traducido.
- Lo que escribe el servidor sale en el idioma de la partida (`campaigns.lang`), que fija `requireMember`.
- Debe correr en una Raspberry Pi 5 (arm64): evita dependencias nativas pesadas y servicios externos.
- Nuevas funcionalidades = nuevo módulo en `apps/server/src/modules/` y `apps/web/src/modules/`, con sus eventos en `packages/shared/src/realtime.ts`.
- Lo oculto a jugadores se filtra en el servidor, nunca solo en el cliente.
- Antes de subir: `pnpm typecheck && pnpm test && pnpm build`.
- Cambios de esquema: editar `apps/server/src/db/schema.ts` y ejecutar `pnpm db:generate`.
- Las reglas de juego son datos (plantillas en `packages/shared/src/systems/`), nunca lógica fija: fórmulas y tiradas pasan por `packages/shared/src/expr.ts`.
- Las tiradas se resuelven siempre en el servidor (módulo `dice`).
