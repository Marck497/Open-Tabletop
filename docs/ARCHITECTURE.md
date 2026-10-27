# Arquitectura

## Objetivos

1. **Ligera:** corre en una Raspberry Pi 5 con un único proceso Node y SQLite. Nada de servicios externos.
2. **Modular:** cada funcionalidad (tablero, hojas, dados...) vive en su propio módulo, en el servidor y en la web, y se añade sin tocar las demás.
3. **Agnóstica del sistema de juego:** el núcleo no sabe nada de D&D. Cada partida tiene un `systemId` (por defecto `dnd5e`) que apunta a una plantilla de datos editable (paso 3).
4. **Tipada de punta a punta:** TypeScript en todo, con los tipos y validaciones compartidos en `@vtt/shared`.

## Estructura

```
packages/shared/     Tipos, esquemas zod y eventos Socket.IO compartidos
apps/server/
  src/core/          Contratos base: ServerModule, AppContext, errores
  src/db/            Esquema Drizzle y conexión SQLite (migraciones en /drizzle)
  src/modules/       Un directorio por funcionalidad
    auth/            Registro, login, sesiones por cookie
    campaigns/       Partidas, miembros, roles, invitaciones
    presence/        Salas en tiempo real y quién está conectado
  src/realtime/      Arranque de Socket.IO y autenticación de sockets
  src/app.ts         Monta los módulos; en producción sirve también la web
apps/web/
  src/core/          Cliente HTTP y conexión Socket.IO
  src/modules/       Mismos módulos que en el servidor (UI + estado)
```

## Cómo se añade un módulo

**Servidor:** crea `apps/server/src/modules/<nombre>/index.ts` que exporte un `ServerModule`:

```ts
export const boardModule: ServerModule = {
  name: 'board',
  routes(app, ctx) { /* rutas HTTP bajo /api */ },
  socket(socket, ctx) { /* eventos en tiempo real */ },
};
```

y añádelo a la lista de `apps/server/src/modules/index.ts`. Si necesita tablas, añádelas a `src/db/schema.ts` y ejecuta `pnpm db:generate`.

**Contrato:** declara sus eventos en `packages/shared/src/realtime.ts` y sus tipos/esquemas en `packages/shared/src/`.

**Web:** crea `apps/web/src/modules/<nombre>/` con sus componentes y hooks, y móntalo en la vista de la partida.

## Seguridad y permisos

- Sesiones con cookie `httpOnly`; en la base de datos solo se guarda el hash del token.
- Contraseñas con `scrypt` (incluido en Node).
- Toda ruta de una partida comprueba la pertenencia con `CampaignService.requireMember` / `requireGm`. Quien no es miembro recibe 404 para no revelar que la partida existe.
- Los sockets se autentican con la misma cookie y solo pueden unirse a salas de partidas de las que son miembros.
- `REGISTRATION_CODE` limita quién puede crear cuenta. Login y registro tienen límite de intentos.

## Tiempo real

Cada partida es una sala de Socket.IO (`campaign:<id>`). Patrón general:

1. El cliente envía una acción (evento con *acknowledgement*).
2. El servidor valida permisos, guarda en SQLite y emite el cambio a la sala.
3. Los clientes aplican el cambio. Lo que el DM oculta (capa del DM, niebla) se filtra **en el servidor** antes de enviarlo a los jugadores, nunca solo en la interfaz.

## Idiomas

La interfaz está en español y en inglés.

- **Textos:** se escriben en español dentro de `tr('…')`, que es a la vez la clave. La traducción está en `packages/shared/src/i18n/en/` (`en/srd.ts` lo genera `scripts/srd/en-names.mjs`). Lo que no está en el diccionario sale tal cual, así que los textos propios de cada mesa no se tocan. Huecos con `{nombre}`: `tr('Turno de {name}', { name })`.
- **Web:** el idioma se elige en cada navegador (selector arriba a la derecha o en *Mesa → Efectos*) y se guarda en `localStorage`. Cambiarlo recarga la página: `core/lang.ts` lo fija antes de cargar `@vtt/shared`, así que también las etiquetas fijas de ahí salen ya traducidas.
- **Servidor:** cada partida tiene su idioma (`campaigns.lang`, por defecto el de quien la crea; el DM lo cambia en *Ajustes*). `requireMember` lo deja en un `AsyncLocalStorage` (`core/lang.ts`) y `tr()` lo usa para lo que escribe el servidor: chat, escenas nuevas, aventuras y hojas de monstruos. Los errores van siempre en español y la web los traduce al recibirlos.
- **Datos:** la plantilla de hoja, los estados, los tipos de daño y los nombres del SRD se guardan en español; se traducen al mostrarlos (`tr()`, `localName()`). Los tipos de daño en inglés («fire») cuentan igual que en español para resistencias e inmunidades.
