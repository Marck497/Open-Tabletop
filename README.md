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
- **Paredes y visión** (🧱 Paredes): arrastra para trazar paredes (se ajustan a las esquinas de la cuadrícula y a los extremos de otras paredes; con *Alt*, libres). Elige el tipo: *pared*, *puerta*, *ventana* (deja ver pero no pasar) o *puerta secreta* (para los jugadores es una pared hasta que la abres). Clic en una pared para cambiarle el tipo; con *Borrar*, para quitarla.
- Activa **Visión** para que cada jugador vea solo lo que ven sus tokens: el resto queda a oscuras y lo ya explorado, en penumbra. Los tokens que no ven ni siquiera se les envían. *Alcance* limita hasta dónde ven (en casillas, 0 = sin límite) y *Ver como jugadores* te muestra la oscuridad. Ojo: con la visión activada, un jugador sin tokens en la escena no ve nada.
- **Puertas**: clic en el icono 🚪 para abrirla o cerrarla. Tú, con *Mayús*+clic, le echas la llave 🔒. Los jugadores abren las puertas que ven y no tienen llave, y no pueden mover sus tokens a través de paredes ni puertas cerradas.
- **Escenas**: puedes preparar otras escenas sin que los jugadores las vean y llevarlos con *Llevar aquí*.

**Todos**
- Arrastra el fondo para moverte y usa la rueda para hacer zoom.
- **Medir** (📏 en la barra): arrastra para medir. *Espacio* añade un punto intermedio, *Alt* mide sin ajustar a la cuadrícula y *Esc* la quita. Todos ven tu regla con tu nombre.
- **Plantillas de área** (◯ círculo, ◺ cono, ━ línea, ▢ cubo): marcan las casillas afectadas por un hechizo y miden casillas enteras.
- **Ping** (📍 o doble clic en el fondo): señala un punto a la mesa. El DM, con *Mayús*, además centra la vista de todos ahí. Lo que mide el DM en la capa DM solo lo ven los DM.
- Al arrastrar un token ves cuánto se ha movido.
- **Dibujar** (✏️): a mano alzada, líneas, rectángulos, elipses y textos, con color y grosor. El DM dibuja en la capa activa (también en la suya, oculta). Los jugadores dibujan en la de tokens y pueden mover, redimensionar o borrar (Supr) sus dibujos.
- **Estados**: al seleccionar un token aparece abajo una barra con las condiciones (envenenado, derribado, concentración…). Se ven como iconos sobre el token. Cada jugador puede marcar los de sus tokens. La lista se edita en la plantilla de hoja (*Estados de los tokens*), y los que tienen *Pierde el turno* hacen que la IA de ese enemigo no actúe.
- La distancia por casilla (5 pies por defecto), la unidad y cómo se cuentan las diagonales se cambian en *Ajustes de la escena*.
- Los tokens se ajustan a la cuadrícula al soltarlos (mantén **Alt** para moverlos libremente).
- **Supr** borra el elemento seleccionado (DM) y **Esc** quita la selección.

## Editor de mapas

Botón **🗺️ Editor de mapas** (solo el DM). Abre una paleta a la derecha del tablero para construir el mapa sin necesitar imágenes:

- **Suelos** con textura: losas, adoquines, madera, baldosas, mármol, alfombra, cueva, hierba, tierra, arena, nieve, bosque, agua, pantano, hielo, lava, abismo, roca y ladrillo (estos dos hacen de pared).
- **Herramientas**: 🖌️ pincel (B, tamaño con `[` y `]`), ▭ rectángulo (R), 🪣 rellenar (G), 🧽 borrar (E), 💧 cuentagotas (I).
- **🏠 Habitación** (H): arrastra un rectángulo y aparece la sala con sus paredes. Si dos salas se tocan, se unen.
- **🚪 Puerta** (P): clic en el borde de una casilla para poner o quitar una puerta.
- **Paredes automáticas**: se ponen solas donde el suelo toca el vacío o un muro y se rehacen al pintar; las que pongas a mano se respetan.
- **🌲 Objetos** (O): árboles, rocas, muebles, cofres, calaveras, señales… de 1 a 4 casillas. Se colocan en la capa *Mapa* y se mueven o giran con ✋.
- **Generar al azar**: una mazmorra (salas, pasillos y puertas) o una cueva, del tamaño de la escena.
- **Deshacer y rehacer** con Ctrl+Z / Ctrl+Y.

Con el editor abierto, el zoom va con la rueda y el mapa se desplaza con el botón central o el derecho.

## Hojas de personaje

- **Personajes** (panel derecho): el DM crea PJ y PNJ y elige qué jugadores los controlan. Un jugador también puede crear el suyo.
- Los PNJ son invisibles para los jugadores salvo que marques *Todos los jugadores pueden ver la hoja*.
- Pulsa 🎲 junto a cualquier valor para tirar. Las tiradas se hacen en el servidor y las ve toda la mesa.
- **Token del personaje**: arrastra el personaje desde la lista al tablero, o usa *Poner token en el tablero* en su hoja. El token muestra su barra de PG, y doble clic abre la hoja.
- **Plantilla editable** (*⚙ Editar plantilla de hoja*): cambia secciones, campos, fórmulas y tiradas; carga otro sistema de serie, o importa y exporta la plantilla en JSON. La 5e viene de serie, pero nada está fijo en el código.

Ejemplos de fórmulas: `floor((fue - 10) / 2)`, `if(sigilo_comp, competencia, 0)`. Ejemplos de tiradas: `1d20 + @{fue_mod}`, `2d20kh1 + 5` (ventaja), `@{dano}` (tira lo que haya escrito en el campo "dano").

### Botones de acción y descansos

Cada fila de la hoja de 5e tiene su botón:

- **⚔ Atacar** (ataques y armas): tira 1d20 + el bono y el daño. Con *Daño extra* (por ejemplo `1d6 fuego` o `2d6 radiante`) sale una segunda tirada de daño en el mismo mensaje.
  - Si el d20 llega a *Crítico con* (20 por defecto, 19 para un campeón), se tiran el doble de dados en todo el daño.
  - Si el bono no es un número (por ejemplo "CD 13 DES"), se tira solo el daño.
- **✨ Lanzar** (conjuros): gasta un espacio del nivel que elijas en el desplegable (por defecto, el más bajo libre) y tira la *Tirada* del conjuro, sea daño o curación. Los trucos no gastan nada. Si no quedan espacios, el botón se apaga.
- **▶ Usar** (*Recursos y usos*): resta un uso a rasgos y objetos como furia, ki, canalizar divinidad o cargas de varita. Cada recurso dice si vuelve con **descanso corto** o **largo**.
- **☾ Descanso corto** y **☀ Descanso largo** (cabecera de la hoja):
  - El corto repone los recursos de descanso corto, y también los espacios si está marcado *Espacios de pacto* (brujo).
  - El largo repone además los PG, todos los espacios y los recursos de descanso largo, y quita los PG temporales.
  - El chat avisa de lo que se ha recuperado.

Las hojas de campañas antiguas reciben estos campos solas la primera vez que se abren. En la plantilla, la sección *Combate, barras de vida e IA de enemigos* dice qué columnas son el daño extra, el crítico, los conjuros, los espacios y los recursos. La IA de enemigos también usa el daño extra y el rango de crítico.

### Vida, CA y estados en los tokens

Los tokens vinculados a una hoja muestran encima su **barra de vida**: verde, amarilla o roja según lo que les queda, y con los **PG temporales** en azul al final. Abajo a la izquierda llevan un **escudo con su CA**.

- **Qué ven los jugadores** lo elige el DM en cada token (panel del elemento → *Lo que ven los jugadores*):
  - **Vida**: solo el DM, barra sin números (proporción aproximada) o barra y números.
  - **CA**: solo el DM o todos.
  - Por defecto, la vida y la CA de los personajes de los jugadores las ve todo el mundo, y las de los enemigos solo el DM.
  - Con *Aplicar a los N enemigos de la escena* se copia la elección a todos los enemigos de golpe.
  - Lo oculto el DM lo ve más apagado y con 🙈.
- **Seguridad**: el servidor solo envía a cada jugador lo que puede ver, y se actualiza solo al cambiar la hoja (daño, curación…).
- **Estados**: los bufos (Bendecido, Acelerado, Inspiración bárdica, Escudo de fe, Furia, Heroísmo, Resistencia) llevan un aro verde y los perjuicios un aro rojo.
- **Plantilla**: en *Combate, barras de vida e IA de enemigos* se elige qué campo son los PG temporales.

## Chat, tiradas e iniciativa

- **Chat** (pestaña por defecto): escribe normal o usa comandos: `/r 1d20+5 Ataque`, `/gr 1d20` (secreta para el DM), `/w Ana texto` (susurro), `/em se esconde`. Con ↑ recuperas lo último que enviaste, y el selector permite hablar como tu personaje.
- Todas las tiradas (de la hoja o del chat) quedan guardadas en el chat.
- **Iniciativa automática**: el DM pulsa **🎲 Tirar a todos** y se tira 1d20 + el bono de iniciativa de la hoja de cada token de la escena (sin hoja, 1d20). La lista se ordena sola; a igualdad, gana el bono más alto. También puede tirar solo *los que faltan* o solo los *enemigos*. Los de la capa DM entran ocultos y su tirada solo la ve el DM.
- Al tirar, **todos ven el orden en grande** en el centro de la pantalla, con el dado y el bono de cada uno (y el resumen queda en el chat). Los jugadores que aún no estén en la lista tienen **🎲 Tirar mi iniciativa** (o la tiran desde su hoja).
- Con el combate empezado, arriba aparece **de quién es el turno y quién va después** (y *¡Es tu turno!* cuando te toca). El token al que le toca se resalta en el tablero y cada jugador puede terminar su propio turno. El DM puede seguir añadiendo tokens a mano y corregir valores.

### Críticos y pifias

Cuando alguien saca un **20 natural** en un d20, toda la mesa ve un destello dorado con "¡CRÍTICO!" y chispas. Con un **1 natural** aparece "¡PIFIA!" en rojo y la pantalla tiembla. Con ventaja o desventaja solo cuenta el dado que se queda. Cada uno puede quitar la animación o el sonido en *Mesa → Efectos*. Las tiradas secretas y los susurros solo los ve quien las recibe.

## Música y ambiente

- En la pestaña **Mesa**, el DM sube audio (MP3, OGG, WAV, M4A, FLAC; máx. 25 MB) y pulsa ▶. Suena a la vez para toda la mesa, sincronizado: quien entra tarde lo oye por donde va.
- Pueden sonar varias pistas a la vez (música + lluvia), cada una con su volumen y en bucle o una sola vez.
- Cada jugador ajusta su propio volumen o silencia. Si el navegador bloquea el sonido, aparece un botón **🔈 Activar sonido**.

## Macros

- **⚙ Macros** (arriba a la derecha del tablero): botones con una o varias líneas de chat, como `/em desenvaina` o `/r 1d20 + @{fue_mod} + @{competencia} Ataque`.
- Si la macro no tiene personaje fijo, tira con el del **token seleccionado** (si lo controlas). Así, una misma macro de "Ataque" vale para todos los PNJ del DM.
- El DM puede compartir macros con toda la mesa (salen con ★).

## Diario

- Pestaña **Diario**: el DM prepara documentos (cartas, pistas, mapas o descripciones) con texto con formato sencillo (`# título`, `**negrita**`, `*cursiva*`, `- lista`) y una imagen.
- Cada documento tiene **notas del DM**, que los jugadores nunca reciben, y se comparte con todos o con jugadores concretos.
- **👁 Enseñar a la mesa** lo abre en la pantalla de quienes pueden verlo. Después lo pueden releer cuando quieran desde su pestaña Diario.

## Crear personajes y reglas del SRD

- **✨ Crear personaje 5e** (pestaña *Personajes*, para el DM y los jugadores) te guía por la creación en siete pasos y crea la hoja ya rellena:
  1. **Especie** y subespecie, con sus bonos.
  2. **Clase**, nivel (1-20) y subclase, con las habilidades de clase y las opciones de rasgos (estilo de combate, linaje dracónico…).
  3. **Características**: serie estándar, compra por puntos (27), 4d6 quitando el más bajo o a mano.
  4. **Trasfondo**, alineamiento e idiomas.
  5. **Equipo inicial**: las elecciones de la clase y del trasfondo. Los paquetes de equipo se abren en el inventario.
  6. **Conjuros**: los trucos y conjuros de la lista de la clase, limitados a los que tocan por nivel.
  7. **Resumen**: el nombre, y la hoja se crea con PG, CA, salvaciones, habilidades, ataques con sus bonos, conjuros, espacios de conjuro, inventario, competencias y rasgos.

  Los avisos (falta elegir algo, te pasas de puntos…) no bloquean, y todo se puede retocar después en la hoja.
- **📚 Reglas** es un compendio para consultar con buscador:
  - **Conjuros**: los 319, con filtro por clase y nivel.
  - **Objetos**: armas, armaduras, equipo, herramientas y objetos mágicos.
  - **Clases**: rasgos por nivel, también los de subclase.
  - **Especies**: con sus rasgos.

  **+ Hoja** añade un conjuro o un objeto a la hoja que elijas; si es un arma, también a sus ataques.
- **Idioma**: los nombres están en español, pero las descripciones largas siguen en el inglés original del SRD.
- **Licencia**: contenido del *System Reference Document 5.1* de D&D, © Wizards of the Coast, bajo licencia [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Los datos salen de [5e-bits/5e-database](https://github.com/5e-bits/5e-database) (MIT). Se regeneran con `node scripts/srd/build.mjs`, y las traducciones están en `scripts/srd/es-*.mjs`.

## Compendio de monstruos

- En *Personajes*, el DM tiene **📖 Compendio**: 45 monstruos del SRD 5.1 (goblins, orcos, esqueletos, ogros, trols, un dragón rojo joven…). Busca por nombre en español o en inglés, o filtra por VD.
- **+ Hoja** crea el PNJ con su hoja de 5e rellena (CA, PG, características, ataques, rasgos). **+ Al tablero** además pone su token del tamaño correcto con la IA ya activada y su comportamiento (los arqueros disparan, los goblins son prudentes…). Con *Cuántos* creas varios a la vez, cada uno con su hoja (Orco 1, Orco 2…).
- Si has cambiado la plantilla de hoja, se rellenan solo los campos que existan.

## IA de enemigos

- Selecciona un token (DM) y en **🤖 IA de enemigo** marca *Actúa solo en su turno*. Elige su comportamiento: *cuerpo a cuerpo*, *a distancia* (mantiene la distancia y dispara), *prudente* (huye cuando le queda poca vida) o *guardián* (espera hasta que alguien se acerca), y a quién ataca: el más cercano, el más herido o al azar.
- Si el token está vinculado a un PNJ, usa su hoja: velocidad, vida y la tabla de ataques. Si no, escribe su ataque y su daño en el mismo panel (p. ej. `1d20 + 5` y `1d12 + 3`).
- En su turno de iniciativa pulsa **🤖 Actuar**: el enemigo busca camino por la cuadrícula esquivando a los demás y rodeando las paredes (y necesita ver a su objetivo para atacarle), se acerca, tira el ataque contra la CA del objetivo y, si impacta, el daño. Todo queda en el chat (en secreto si el enemigo está en la capa DM).
- **🤖 IA automática** (en el panel de iniciativa): los enemigos con IA juegan su turno solos y pasan al siguiente, hasta que le toca a un jugador. **Aplicar daño** resta el daño a los PG del personaje.
- Qué campos usa (CA, PG, velocidad, tabla de ataques) se cambia en *Editar plantilla de hoja → Combate e IA de enemigos*, así que también funciona con otros sistemas.

## Copias de seguridad

- En la pestaña **Mesa**, el DM tiene **⬇ Descargar copia**: un archivo `.vtt.json.gz` con escenas, tokens, paredes, niebla, hojas, plantilla, diario, macros compartidas y música. Con *Incluir imágenes y música* también lleva los archivos (pesa más). El chat no se guarda.
- Para restaurarla, en la lista de partidas pulsa **⬆ Elegir archivo** en *Restaurar una copia de seguridad* (máx. 500 MB). Se crea una partida **nueva** en la que eres el DM: los jugadores no van en la copia, así que hay que invitarlos otra vez y asignarles sus personajes.
- Sirve también para pasar una partida de un servidor a otro (p. ej. de tu PC a la Raspberry). Además de esto, conviene copiar de vez en cuando la carpeta de datos entera (ver *Instalar en la Raspberry Pi 5*).

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
