# Mesa de Rol 🎲

Mesa virtual (VTT) para jugar a rol online con amigos, inspirada en Roll20. Pensada para alojarse en casa en una **Raspberry Pi 5** y crecer módulo a módulo.

## Estado

| Paso | Contenido | Estado |
| --- | --- | --- |
| 1 | Base: cuentas, partidas, invitaciones, roles DM/jugador, presencia en tiempo real, Docker | ✅ |
| 2 | Tablero en tiempo real: mapas, cuadrícula, tokens, capas y niebla de guerra | ✅ |
| 3 | Hojas de personaje editables (plantilla D&D 5e, sistema intercambiable) | ✅ |
| 4 | Chat, dados, iniciativa y guía para conectarse desde fuera | ✅ |

## Instalar en la Raspberry Pi 5

Necesitas Raspberry Pi OS de 64 bits (o cualquier Linux arm64) con Docker.

```bash
# 1. Instala Docker (solo la primera vez)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar después

# 2. Descarga el proyecto
git clone https://github.com/Marck497/Programa-DND.git
cd Programa-DND

# 3. Configuración (opcional, pero recomendado si la abres a internet)
cp .env.example .env
nano .env   # pon un REGISTRATION_CODE para que solo tus amigos puedan registrarse

# 4. Arranca
docker compose up -d --build
```

Abre `http://IP-DE-LA-PI:3000` desde cualquier equipo de tu red. La primera compilación en la Pi tarda unos minutos.

- **Actualizar:** `git pull && docker compose up -d --build`
- **Ver logs:** `docker compose logs -f`
- **Copia de seguridad:** todo se guarda en la carpeta `data/`. Copiarla es suficiente.

> **Para que tus amigos entren desde su casa** sigue [`docs/ACCESO_EXTERNO.md`](docs/ACCESO_EXTERNO.md). La opción recomendada (Tailscale Funnel) es gratis y no hace falta tocar el router. Ahí también se explica cómo hacer copias de seguridad.

## Cómo se usa el tablero

**DM**
- Elige la **capa** en la barra superior: *Mapa* (fondo), *Tokens* (personajes) o *DM* (solo la ves tú). Solo puedes seleccionar elementos de la capa activa.
- **+ Imagen** sube mapas o retratos; **+ Token** crea una ficha de color. En el panel derecho cambias nombre, tamaño, capa, imagen y qué jugadores pueden moverla.
- **Niebla**: actívala y usa *Revelar* / *Ocultar* arrastrando rectángulos. Tú la ves semitransparente; los jugadores, negra. Los tokens enemigos bajo la niebla ni siquiera se envían a los jugadores.
- **Escenas**: puedes preparar otras escenas sin que los jugadores las vean y llevarlos con *Llevar aquí*.

**Todos**
- Arrastra el fondo para moverte y usa la rueda para hacer zoom.
- **Medir** (📏 en la barra): arrastra para medir. *Espacio* añade un punto intermedio, *Alt* mide sin ajustar a la cuadrícula y *Esc* la quita. Todos ven tu regla con tu nombre.
- **Plantillas de área** (◯ círculo, ◺ cono, ━ línea, ▢ cubo): marcan las casillas afectadas por un hechizo y miden casillas enteras.
- **Ping** (📍 o doble clic en el fondo): señala un punto a la mesa. El DM, con *Mayús*, además centra la vista de todos ahí. Lo que mide el DM en la capa DM solo lo ven los DM.
- Al arrastrar un token ves cuánto se ha movido.
- La distancia por casilla (5 pies por defecto), la unidad y cómo se cuentan las diagonales se cambian en *Ajustes de la escena*.
- Los tokens se ajustan a la cuadrícula al soltarlos (mantén **Alt** para moverlos libremente).
- **Supr** borra el elemento seleccionado (DM) y **Esc** quita la selección.

## Hojas de personaje

- **Personajes** (panel derecho): el DM crea PJ y PNJ y elige qué jugadores los controlan. Un jugador también puede crear el suyo.
- Los PNJ son invisibles para los jugadores salvo que marques *Todos los jugadores pueden ver la hoja*.
- Pulsa 🎲 junto a cualquier valor para tirar. Las tiradas se hacen en el servidor y las ve toda la mesa.
- **Token del personaje**: arrastra el personaje desde la lista al tablero, o usa *Poner token en el tablero* en su hoja. El token muestra su barra de PG, y doble clic abre la hoja.
- **Plantilla editable** (*⚙ Editar plantilla de hoja*): cambia secciones, campos, fórmulas y tiradas; carga otro sistema de serie, o importa y exporta la plantilla en JSON. La 5e viene de serie, pero nada está fijo en el código.

Ejemplos de fórmulas: `floor((fue - 10) / 2)`, `if(sigilo_comp, competencia, 0)`. Ejemplos de tiradas: `1d20 + @{fue_mod}`, `2d20kh1 + 5` (ventaja), `@{dano}` (tira lo que haya escrito en el campo "dano").

## Chat, tiradas e iniciativa

- **Chat** (pestaña por defecto): escribe normal o usa comandos: `/r 1d20+5 Ataque`, `/gr 1d20` (secreta para el DM), `/w Ana texto` (susurro), `/em se esconde`. Con ↑ recuperas lo último que enviaste, y el selector permite hablar como tu personaje.
- Todas las tiradas (de la hoja o del chat) quedan guardadas en el chat.
- **Iniciativa**: el DM añade tokens (los de la capa DM entran ocultos) y pulsa *Empezar*. Los jugadores entran tirando *Iniciativa* desde su hoja. El token al que le toca se resalta en el tablero, y cada jugador puede terminar su propio turno.

## Desarrollo

Requisitos: Node 22+ y pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # servidor en :3000 y web en http://localhost:5173
pnpm test         # tests del servidor (API y tiempo real)
pnpm typecheck
pnpm build
```

Si cambias el esquema de la base de datos (`apps/server/src/db/schema.ts`), genera la migración con `pnpm db:generate`. Se aplica sola al arrancar.

## Arquitectura

Resumen en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). En corto:

- `packages/shared`: tipos, validaciones y contrato de eventos en tiempo real que comparten servidor y web.
- `apps/server`: Fastify + Socket.IO + SQLite (Drizzle). Cada funcionalidad es un **módulo** en `src/modules/`.
- `apps/web`: React + Vite. Misma organización por módulos en `src/modules/`.
