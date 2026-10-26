/** Pestañas de la barra lateral de la mesa. */
export type SidebarTab = 'chat' | 'characters' | 'journal' | 'scenes' | 'table' | 'settings';

/** Un paso del recorrido guiado. */
export interface TourStep {
  title: string;
  body: string;
  /** Elemento a resaltar: valor de su atributo `data-tour`. Sin él (o si no está en pantalla), la tarjeta sale centrada. */
  target?: string;
  /** Pestaña lateral que se abre al llegar a este paso. */
  tab?: SidebarTab;
}

const welcome = (role: string): TourStep => ({
  title: 'Bienvenido a la mesa',
  body: `Este recorrido te enseña lo principal como ${role}. Usa Siguiente y Anterior (o las flechas ← →) y sal cuando quieras con Saltar o Esc. Puedes volver a abrirlo escribiendo /tutorial en el chat.`,
});

const end: TourStep = {
  title: '¡Listo!',
  body: 'Eso es lo principal. Casi todos los botones explican qué hacen si dejas el ratón encima. Escribe /tutorial en el chat para repetir el recorrido.',
};

/** Recorrido para el DM. */
export const GM_TOUR: TourStep[] = [
  welcome('DM'),
  {
    target: 'board',
    title: 'El tablero',
    body: 'Arrastra el fondo para moverte y usa la rueda para el zoom. Doble clic hace un ping que ve toda la mesa. Arrastra tokens para moverlos (con Alt, sin ajustarse a la cuadrícula); sin soltar, un clic derecho deja un punto de giro para doblar esquinas, y también sirve con la regla. Ctrl+Z deshace y Ctrl+Y rehace.',
  },
  {
    target: 'tools',
    title: 'Herramientas',
    body: '✋ selecciona y mueve. 📏 ◯ ◺ ━ ▢ miden distancias y áreas de hechizos. ✏️ dibuja, y 📍 señala un punto (con Mayús, centra la vista de todos ahí). ⌨ (o la tecla ?) enseña los atajos de teclado.',
  },
  {
    target: 'layers',
    title: 'Capas',
    body: 'Mapa es el fondo, Tokens es donde se juega y DM (oculta) guarda lo que los jugadores no deben ver: trampas, enemigos al acecho, notas. Lo de la capa del DM nunca sale del servidor hacia los jugadores.',
  },
  {
    target: 'add',
    title: 'Tokens e imágenes',
    body: 'Añade tokens o imágenes en la capa activa. Al seleccionar uno aparece a la derecha su panel: nombre, tamaño, dueños, vida, CA, luz, visión en la oscuridad e IA de enemigo. También puedes arrastrar un personaje de la pestaña Personajes al tablero.',
  },
  {
    target: 'fog',
    title: 'Niebla de guerra',
    body: 'Abre el menú ☁ Niebla para activarla. Elige ☀ Revelar o ☁ Ocultar y arrastra sobre el tablero, o revela o tapa todo de golpe.',
  },
  {
    target: 'vision',
    title: 'Paredes y visión',
    body: '🧱 Paredes traza muros y puertas. En el menú 👁 Visión activas la visión dinámica: cada jugador solo ve lo que ven sus tokens y las paredes tapan la vista. Recordar lo explorado deja en gris lo ya visto. Con 🌙 A oscuras solo se ve lo que alumbran las luces (antorchas, lámparas) o la visión en la oscuridad, que se configuran en el panel de cada token. Ver como jugadores te enseña el tablero como lo ven ellos.',
  },
  {
    target: 'mapeditor',
    title: 'Editor de mapas',
    body: 'Pinta suelos, crea salas con sus paredes, pon puertas y objetos (o espárcelos con el pincel: un bosque en un trazo), coloca salas prediseñadas ya amuebladas (taberna, templo, cripta…) o genera al azar una mazmorra, cripta, castillo, alcantarillas, mina, cueva, bosque, camino o pueblo ya amueblado para improvisar.',
  },
  {
    target: 'scene-switcher',
    tab: 'scenes',
    title: 'Escenas',
    body: 'Cada escena es un mapa distinto. Desde aquí y desde la pestaña Escenas puedes preparar una sin que la vean los jugadores, ajustar su cuadrícula y llevar a la party (o a un jugador) a otra. ⧉ Duplicar copia la escena abierta, 📚 Biblioteca guarda escenas para reutilizarlas en otras partidas y ⬆ Importar trae mapas de Dungeondraft con sus paredes, puertas y luces.',
  },
  {
    target: 'characters',
    tab: 'characters',
    title: 'Personajes y hojas',
    body: '✨ Crear personaje 5e rellena la hoja con especie, clase, equipo y conjuros. En la hoja, los botones ⚔ ✨ ▶ tiran ataques y hechizos, y abajo están los descansos. ⚙ Editar plantilla de hoja cambia los campos y fórmulas.',
  },
  {
    target: 'library',
    tab: 'characters',
    title: 'Compendio, reglas y creaciones',
    body: '📖 Compendio (justo encima) trae monstruos del SRD con su hoja y su IA, y ⚔ Encuentros guarda grupos de monstruos con su dificultad para soltarlos en el tablero con un clic. 📚 Reglas busca conjuros, objetos, clases y especies. ⚗ Creaciones es tu taller de hechizos, ataques y objetos propios, con áreas, salvaciones y daño que aplicas con 🎯.',
  },
  {
    target: 'chat',
    tab: 'chat',
    title: 'Chat y dados',
    body: '/r 1d20+5 tira dados, /gr tira en secreto, /w Ana susurra y /em narra una acción. Las tiradas las resuelve el servidor, así que nadie puede trucarlas. El botón ? lista los comandos.',
  },
  {
    target: 'macros',
    title: 'Macros',
    body: 'Guarda tiradas o comandos que repites mucho y lánzalos con un clic desde esta barra. Puedes compartirlos con la mesa.',
  },
  {
    target: 'initiative',
    title: 'Iniciativa',
    body: 'Añade los tokens, tira la iniciativa y pulsa Empezar. Siguiente ▶ pasa el turno, y 🤖 Actuar hace que un enemigo juegue su turno solo.',
  },
  {
    target: 'damage',
    title: 'Daño y curación',
    body: 'Selecciona un token (o coloca una plantilla de área encima de varios) y, en su panel, escribe una cantidad o una tirada como 2d6 + 3 y pulsa 🩸 Daño o 💚 Curar. Se tienen en cuenta el tipo de daño, las resistencias, los PG temporales y la concentración.',
  },
  {
    target: 'journal',
    tab: 'journal',
    title: 'Diario',
    body: 'Prepara cartas, pistas o mapas y compártelos con toda la mesa o con quien tú quieras cuando llegue el momento.',
  },
  {
    target: 'table',
    tab: 'table',
    title: 'Mesa y música',
    body: 'Aquí ves quién está conectado, pones música y ambiente y eliges qué efectos y animaciones ver en este dispositivo.',
  },
  {
    target: 'settings',
    tab: 'settings',
    title: 'Ajustes',
    body: 'El enlace de invitación para tus amigos, las copias de seguridad de la partida y el rendimiento de la Raspberry. Truco: Mayús+1, 2, 3… abre cada pestaña, B esconde la barra lateral y puedes arrastrar su borde para ensancharla.',
  },
  end,
];

/** Recorrido para los jugadores. */
export const PLAYER_TOUR: TourStep[] = [
  welcome('jugador'),
  {
    target: 'board',
    title: 'El tablero',
    body: 'Arrastra el fondo para moverte y usa la rueda para el zoom. Arrastra tus tokens para moverlos (sin soltar, un clic derecho deja un punto de giro para rodear una pared o doblar una esquina) y haz doble clic para señalar un punto a la mesa. Si el DM activa la visión, solo verás lo que ven tus tokens.',
  },
  {
    target: 'tools',
    title: 'Herramientas',
    body: '✋ selecciona y mueve. 📏 ◯ ◺ ━ ▢ miden distancias y áreas de hechizos. ✏️ dibuja y 📍 hace un ping. ⌨ (o la tecla ?) enseña los atajos de teclado, como mover tu token con las flechas.',
  },
  {
    target: 'characters',
    tab: 'characters',
    title: 'Tu personaje',
    body: '✨ Crear personaje 5e te rellena la hoja paso a paso. En la hoja, los botones ⚔ ✨ ▶ tiran ataques y hechizos, y abajo están los descansos. Para apuntar a alguien, Alt+clic en su token antes de atacar.',
  },
  {
    target: 'library',
    tab: 'characters',
    title: 'Reglas y creaciones',
    body: '📚 Reglas busca conjuros, objetos, clases y especies del SRD. ⚗ Creaciones guarda hechizos, ataques y objetos propios que funcionan con los botones de la hoja.',
  },
  {
    target: 'chat',
    tab: 'chat',
    title: 'Chat y dados',
    body: '/r 1d20+5 tira dados, /gr tira en secreto para el DM, /w Ana susurra y /em narra una acción. Con el selector puedes hablar como tu personaje. El botón ? lista los comandos.',
  },
  {
    target: 'macros',
    title: 'Macros',
    body: 'Guarda tiradas o comandos que repites mucho y lánzalos con un clic desde esta barra.',
  },
  {
    target: 'initiative',
    title: 'Iniciativa',
    body: 'En combate aparece aquí el orden de turnos. Pulsa 🎲 Tirar mi iniciativa cuando te lo pidan y Terminar mi turno al acabar.',
  },
  {
    target: 'journal',
    tab: 'journal',
    title: 'Diario',
    body: 'Aquí aparecen las cartas, pistas y mapas que el DM te enseña.',
  },
  {
    target: 'table',
    tab: 'table',
    title: 'Mesa y música',
    body: 'Mira quién está conectado, ajusta tu volumen de la música y elige qué efectos y animaciones quieres ver en este dispositivo. Truco: Mayús+1, 2, 3… abre cada pestaña y B esconde la barra lateral para ver más tablero. Las hojas de personaje se arrastran por su cabecera.',
  },
  end,
];
