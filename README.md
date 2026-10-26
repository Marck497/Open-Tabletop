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
- **Niebla** (menú ☁ Niebla): actívala y usa *Revelar* / *Ocultar* arrastrando rectángulos. Tú la ves semitransparente; los jugadores, negra. Los tokens enemigos bajo la niebla ni siquiera se envían a los jugadores.
- **Paredes y visión** (🧱 Paredes): arrastra para trazar paredes (se ajustan a las esquinas de la cuadrícula y a los extremos de otras paredes; con *Alt*, libres). Elige el tipo: *pared*, *puerta*, *ventana* (deja ver pero no pasar) o *puerta secreta* (para los jugadores es una pared hasta que la abres). Clic en una pared para cambiarle el tipo; con *Borrar*, para quitarla. En el tablero se dibujan como muros de piedra con pilares en las esquinas, las puertas de madera (abiertas, giradas sobre la bisagra) y las ventanas con cristal; las líneas de colores solo salen mientras editas con 🧱 Paredes.
- En el menú **👁 Visión** activa la *visión dinámica* para que cada jugador vea solo lo que ven sus tokens: el resto queda a oscuras y lo ya explorado, en penumbra. Los tokens que no ven ni siquiera se les envían. *Alcance* limita hasta dónde ven (en casillas, 0 = sin límite) y *Ver como jugadores* te muestra la oscuridad. Ojo: con la visión activada, un jugador sin tokens en la escena no ve nada.
- **Puertas**: clic en el icono 🚪 para abrirla o cerrarla. Tú, con *Mayús*+clic, le echas la llave 🔒. Los jugadores abren las puertas que ven y no tienen llave, y no pueden mover sus tokens a través de paredes ni puertas cerradas.
- **Escenas**: el botón **🗺** de la barra de arriba (y la pestaña *Escenas*) abre la lista de mapas que tienes preparados.
  - Pulsa una escena para abrirla **solo tú**: los jugadores no la ven hasta que los lleves.
  - **Llevar ▾** te deja elegir:
    - **Toda la party**: todos van a esa escena.
    - Solo a los jugadores que marques: el resto se queda donde estaba, y así puedes dividir el grupo.
  - Cada jugador ve únicamente la escena en la que está. En la lista, la escena de la party lleva la etiqueta *Party*, y cada jugador aparece con su inicial en el mapa donde se encuentra. Arriba ves quién está en la escena que tienes abierta.
  - **Carpetas**: créalas con *+ Carpeta* (📁+ crea una subcarpeta), renómbralas con ✎ y pliégalas con un clic. Si borras una carpeta, sus escenas no se pierden: suben a la carpeta de arriba.
  - **Arrastra** una escena o una carpeta para ordenarla. Soltarla encima de otra carpeta la mete dentro; soltarla en el borde superior la coloca delante. Con *Suelta aquí para sacar de las carpetas* vuelve a la raíz.
  - **⧉ Duplicar** (pestaña *Escenas*, con la escena abierta): hace una copia justo debajo, con su mapa, paredes, niebla, luces, objetos y enemigos. Los tokens y dibujos de los jugadores no se copian.
  - **📚 Guardar en biblioteca**: guarda una copia en tu biblioteca personal (imágenes incluidas). Desde **📚 Biblioteca**, en cualquiera de tus partidas, *+ Usar aquí* crea una escena nueva a partir de ella. Lo que guardas sigue ahí aunque borres la escena o la partida original.
  - **⬆ Importar** (arriba en la pestaña *Escenas*) crea una escena a partir de un **mapa de Dungeondraft** (`.dd2vtt`) o de otros programas que exportan en formato *Universal VTT* (Dungeon Alchemist `.uvtt`, DungeonFog `.df2vtt`…):
    - la imagen del mapa ocupa toda la escena, en la capa *Mapa*;
    - las paredes y puertas quedan puestas y alineadas con las del dibujo. No se pintan encima, porque la imagen ya las trae, pero tapan la vista y no dejan pasar;
    - cada luz del mapa es una luz invisible en la capa del DM;
    - se activa la visión dinámica, pero no la oscuridad, porque la imagen ya trae su iluminación.

    La imagen tiene que pesar menos de 25 MB: si pesa más, expórtalo con menos píxeles por casilla (por ejemplo 100) o en WEBP.
  - **⬇ Exportar** descarga la escena como archivo `.vtt-escena.json.gz` para pasársela a otro DM o llevarla a otro servidor; se carga con *⬆ Importar archivo de escena* en la ventana de la biblioteca. Los tokens van sin hoja vinculada ni dueños.

**Todos**
- Arrastra el fondo para moverte y usa la rueda para hacer zoom.
- **Medir** (📏 en la barra): arrastra para medir. Sin soltar, un **clic derecho** (o *Espacio*) añade un punto de giro para cambiar de dirección, *Alt* mide sin ajustar a la cuadrícula y *Esc* la quita. Todos ven tu regla con tu nombre.
- **Plantillas de área** (◯ círculo, ◺ cono, ━ línea, ▢ cubo): marcan las casillas afectadas por un hechizo y miden casillas enteras.
- **Ping** (📍 o doble clic en el fondo): señala un punto a la mesa. El DM, con *Mayús*, además centra la vista de todos ahí. Lo que mide el DM en la capa DM solo lo ven los DM.
- Al arrastrar un token ves cuánto se ha movido. Sin soltarlo, un **clic derecho** (o *Espacio*) deja un punto de giro: así doblas una esquina o rodeas una pared que no puedes atravesar en línea recta, y la distancia cuenta el camino entero.
- **Dibujar** (✏️): a mano alzada, líneas, rectángulos, elipses y textos, con color y grosor. El DM dibuja en la capa activa (también en la suya, oculta). Los jugadores dibujan en la de tokens y pueden mover, redimensionar o borrar (Supr) sus dibujos.
- **Estados**: al seleccionar un token aparece abajo una barra con las condiciones (envenenado, derribado, concentración…). Se ven como iconos sobre el token. Cada jugador puede marcar los de sus tokens. La lista se edita en la plantilla de hoja (*Estados de los tokens*), y los que tienen *Pierde el turno* hacen que la IA de ese enemigo no actúe.
- La distancia por casilla (5 pies por defecto), la unidad y cómo se cuentan las diagonales se cambian en *Ajustes de la escena*.
- Los tokens se ajustan a la cuadrícula al soltarlos (mantén **Alt** para moverlos libremente).
- **Supr** borra el elemento seleccionado (DM) y **Esc** quita la selección.

**Organizar la pantalla**
- **Hojas de personaje**: arrástralas por la cabecera (⠿) a donde quieras y minimízalas con ▁. Cada navegador recuerda dónde dejaste cada hoja. La que tocas pasa delante.
- **Barra lateral**: arrastra su borde izquierdo para ensancharla (doble clic la deja como estaba) y escóndela con **Panel ⇥** arriba a la derecha o con la tecla **B**.
- **Mensajes nuevos**: si estás en otra pestaña (o con la barra escondida), un número rojo te avisa de los mensajes del chat y de los documentos que el DM te comparte en el Diario.
- **Pestañas**: *Mayús+1, 2, 3…* abre cada una. El DM tiene además **⚙️ Ajustes** con la invitación, las copias de seguridad y el rendimiento.

## Editor de mapas

Botón **🗺️ Editor de mapas** (solo el DM). Abre una paleta a la derecha del tablero para construir el mapa sin necesitar imágenes:

- **Suelos** con textura: losas, adoquines, madera, baldosas, mármol, alfombra, cueva, hierba, tierra, arena, nieve, bosque, agua, pantano, hielo, lava, abismo, roca y ladrillo (estos dos hacen de pared).
- **Herramientas**: 🖌️ pincel (B, tamaño con `[` y `]`), ▭ rectángulo (R), 🪣 rellenar (G), 🧽 borrar (E), 💧 cuentagotas (I).
- **🏠 Habitación** (H): arrastra un rectángulo y aparece la sala con sus paredes. Si dos salas se tocan, se unen.
- **🚪 Puerta** (P): clic en el borde de una casilla para poner o quitar una puerta.
- **Paredes automáticas**: se ponen solas donde el suelo toca el vacío o un muro y se rehacen al pintar; las que pongas a mano se respetan.
- **🌲 Objetos** (O): árboles, rocas, muebles, cofres, calaveras, señales… de 1 a 4 casillas. Se colocan en la capa *Mapa* y se mueven o giran con ✋. Un objeto también puede **dar luz** (una hoguera, una vela): selecciónalo y elige la luz en su panel.
- **🏛️ Salas prediseñadas** (S): taberna, tienda, habitación de posada, herrería, plaza con fuente, templo, sala del trono, biblioteca, sala funeraria, celdas, altar ritual y campamento. Clic en el mapa y aparece la sala con su suelo, paredes, puertas (las de las celdas, con llave), muebles y luces; **T** (o *↻ Girar*) la gira antes de colocarla. Luego se retoca como cualquier otra cosa. Las de exterior (plaza y campamento) no llevan paredes: quedan mejor sobre hierba o tierra ya pintada.
- **Generar al azar**, del tamaño de la escena. Elige el estilo:
  - **🏰 Mazmorra**: salas de piedra y pasillos de adoquines.
  - **⚰️ Cripta**: tumbas, osarios y capillas con velas.
  - **👑 Castillo**: salas grandes de mármol, como el trono, el comedor, la armería o la biblioteca.
  - **🌊 Alcantarillas**: canales de agua entre salas de adoquín.
  - **⛏️ Mina**: galerías de tierra entre cámaras con vetas y derrumbes.
  - **🕳️ Cueva**: natural, rodeada de roca.

  Elige también cuántas salas quieres (pocas, normal o muchas). Con **Amueblar** (activado por defecto), a cada sala le toca un uso (almacén, cuartel, tumbas, armería…) y se llena con sus objetos y alguna antorcha o vela que da luz, sin tapar entradas ni puertas. **🎲 Generar** se puede pulsar varias veces hasta que guste: cada vez se quitan los muebles del mapa anterior (los objetos que pusiste a mano se quedan) y Ctrl+Z vuelve al anterior. *Limpiar* borra el suelo y los muebles generados.
- **Deshacer y rehacer** con Ctrl+Z / Ctrl+Y, también los objetos y las salas que pongas.

Con el editor abierto, el zoom va con la rueda y el mapa se desplaza con el botón central o el derecho. Mientras está abierto, las letras son atajos de sus herramientas (no de las del tablero); **M** lo cierra.

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

### Daño y curación a mano

El DM puede quitar o dar vida sin usar una creación: selecciona un token (o coloca una plantilla de área encima de varios) y, en el panel del elemento, apartado **❤ Daño y curación**:

- Escribe la **cantidad**: un número (`8`) o una tirada (`2d6 + 3`), que se tira en el servidor. Intro aplica el daño.
- Si es daño, elige el **tipo** (fuego, cortante…) para que cuenten las **resistencias, inmunidades y vulnerabilidades**; déjalo vacío para daño sin tipo.
- **🩸 Daño** resta primero los **PG temporales** y luego los PG, sin bajar de 0. **💚 Curar** suma PG sin pasar del máximo.
- Si el objetivo se está **concentrando**, se tira su salvación igual que con cualquier otro daño.
- El resumen sale en el chat; si algún token está en la capa del DM, solo lo ve el DM.

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

## Creaciones: hechizos, ataques y objetos propios

- En *Personajes*, **⚗ Creaciones** abre la lista de hechizos, ataques y objetos de la mesa, con buscador. El DM los ve todos; cada jugador, los suyos y los que el DM marca como *Compartida*.
- **+ Hechizo / + Ataque / + Objeto** abre el editor, donde se cambia todo:
  - **Ficha**: nivel, escuela, tiempo, alcance, componentes, duración, concentración y ritual (hechizos); categoría, rareza, peso, precio, sintonización y *consumible* (objetos).
  - **Tirada de ataque** (cuerpo a cuerpo o a distancia) con su bono y desde qué número es crítico.
  - **Salvación**: característica, CD y si se recibe la mitad del daño al salvar.
  - **Daños** de varios tipos, **curación** y, en los hechizos, los dados que se suman por cada nivel de espacio superior.
  - **Área** (esfera, cono, línea o cubo y su tamaño), **estados** que pone a los objetivos y estado del lanzador (concentración).
  - **Usos** y si vuelven con descanso corto o largo.
  - Las fórmulas aceptan números o campos de la hoja de quien lo use, como `@{conj_cd}` o `@{competencia} + @{fue_mod}`.
- En **📚 Reglas**, el botón **✎** de un conjuro u objeto lo copia a Creaciones para retocarlo (daño, salvación, área y mejora por nivel ya vienen rellenos).
- **+ Hoja** la añade a un personaje: a sus conjuros, ataques o inventario, y a *Recursos* si tiene usos. Esas filas quedan **enlazadas**: los botones ⚔, ✨ y ▶ de la hoja hacen lo que diga la creación (también después de editarla), gastan el espacio, el uso o la poción, y la IA de enemigos usa su ataque. **▶** en la lista la usa al momento con el personaje elegido.
- En el chat, el mensaje trae la salvación, el área y los estados:
  - **📐 Plantilla** pone en el tablero la plantilla de área con su tamaño: clic donde empieza y arrastra para orientarla.
  - **🎯 Aplicar** (DM) se lo aplica a los tokens de esa plantilla o, si no hay, al seleccionado. Los ataques se comparan con la CA; las salvaciones se tiran con la hoja de cada uno (mitad o nada al salvar). Luego se resta el daño (primero los PG temporales), se suma la curación y se ponen los estados. Si algún objetivo está en la capa del DM, el resumen solo lo ve el DM.
- Las creaciones entran en la copia de seguridad (las compartidas y las del DM).

## Compendio de monstruos

- En *Personajes*, el DM tiene **📖 Compendio**: 45 monstruos del SRD 5.1 (goblins, orcos, esqueletos, ogros, trols, un dragón rojo joven…). Busca por nombre en español o en inglés, o filtra por VD.
- **+ Hoja** crea el PNJ con su hoja de 5e rellena (CA, PG, características, ataques, rasgos). **+ Al tablero** además pone su token del tamaño correcto con la IA ya activada y su comportamiento (los arqueros disparan, los goblins son prudentes…). Con *Cuántos* creas varios a la vez, cada uno con su hoja (Orco 1, Orco 2…).
- Si has cambiado la plantilla de hoja, se rellenan solo los campos que existan.

## Encuentros preparados

En *Personajes*, el DM tiene **⚔ Encuentros**: grupos de monstruos del compendio preparados de antemano («Emboscada goblin: 4 goblins y un lobo»).

- **+ Nuevo encuentro**: busca monstruos y añádelos con **+**, ajusta cuántos de cada uno y apunta notas (dónde están, cómo atacan…). **🎲 Sugerir** propone uno al azar de la dificultad que elijas, y puedes pulsarlo varias veces.
- **Dificultad**: cada encuentro dice si es *fácil*, *medio*, *difícil* o *mortal* para tu grupo, con las reglas del SRD 5.1 (PX de los monstruos, multiplicador según cuántos son y umbrales por nivel). El grupo sale de los personajes que tienen jugador y de su nivel; puedes cambiarlo a mano arriba.
- **▶ Al tablero**: crea la hoja de cada monstruo (Goblin 1, Goblin 2…) y pone sus tokens, con su tamaño y la IA activada, en casillas libres alrededor del centro de tu vista, sin atravesar paredes ni pisar a nadie. Con *Soltarlos escondidos* van a la capa del DM.
- Los encuentros son de la partida y entran en la copia de seguridad.

## IA de enemigos

- Selecciona un token (DM) y en **🤖 IA de enemigo** marca *Actúa solo en su turno*. Elige su comportamiento: *cuerpo a cuerpo*, *a distancia* (mantiene la distancia y dispara), *prudente* (huye cuando le queda poca vida) o *guardián* (espera hasta que alguien se acerca), y a quién ataca: el más cercano, el más herido o al azar.
- Si el token está vinculado a un PNJ, usa su hoja: velocidad, vida y la tabla de ataques. Si no, escribe su ataque y su daño en el mismo panel (p. ej. `1d20 + 5` y `1d12 + 3`).
- En su turno de iniciativa pulsa **🤖 Actuar**: el enemigo busca camino por la cuadrícula esquivando a los demás y rodeando las paredes (y necesita ver a su objetivo para atacarle), se acerca, tira el ataque contra la CA del objetivo y, si impacta, el daño. Todo queda en el chat (en secreto si el enemigo está en la capa DM).
- **🤖 IA automática** (en el panel de iniciativa): los enemigos con IA juegan su turno solos y pasan al siguiente, hasta que le toca a un jugador. **Aplicar daño** resta el daño a los PG del personaje.
- Qué campos usa (CA, PG, velocidad, tabla de ataques) se cambia en *Editar plantilla de hoja → Combate e IA de enemigos*, así que también funciona con otros sistemas.

## Copias de seguridad

- En la pestaña **⚙️ Ajustes**, el DM tiene **⬇ Descargar copia**: un archivo `.vtt.json.gz` con escenas y sus carpetas, tokens, paredes, niebla, hojas, plantilla, diario, macros compartidas, encuentros preparados y música. Con *Incluir imágenes y música* también lleva los archivos (pesa más). El chat no se guarda.
- Para restaurarla, en la lista de partidas pulsa **⬆ Elegir archivo** en *Restaurar una copia de seguridad* (máx. 500 MB). Se crea una partida **nueva** en la que eres el DM: los jugadores no van en la copia, así que hay que invitarlos otra vez y asignarles sus personajes.
- Sirve también para pasar una partida de un servidor a otro (p. ej. de tu PC a la Raspberry). La 📚 biblioteca de escenas es tuya y no de la partida, así que no va en la copia: para llevar una escena suelta, usa *⬇ Exportar* en la pestaña *Escenas*. Además de esto, conviene copiar de vez en cuando la carpeta de datos entera (ver *Instalar en la Raspberry Pi 5*).

## Desarrollo

Requisitos: Node 22+ y pnpm (`corepack enable`).

```bash
pnpm install
pnpm dev          # servidor en :3000 y web en http://localhost:5173
pnpm test         # tests del servidor (API y tiempo real)
pnpm typecheck
pnpm build
```

### Lanzador rápido

`scripts/mesa.sh` reúne lo anterior en un menú: abrir la mesa en el navegador (`localhost:5173`), pasar las pruebas (tipos + tests) o ambas cosas. Instala las dependencias si hace falta. También acepta `lanzar`, `pruebas` o `todo` como argumento. Para parar la mesa, `Ctrl+C`.

Si cambias el esquema de la base de datos (`apps/server/src/db/schema.ts`), genera la migración con `pnpm db:generate`. Se aplica sola al arrancar.

## Arquitectura

Resumen en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). En corto:

- `packages/shared`: tipos, validaciones y contrato de eventos en tiempo real que comparten servidor y web.
- `apps/server`: Fastify + Socket.IO + SQLite (Drizzle). Cada funcionalidad es un **módulo** en `src/modules/`.
- `apps/web`: React + Vite. Misma organización por módulos en `src/modules/`.
