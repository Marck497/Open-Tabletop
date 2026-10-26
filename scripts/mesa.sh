#!/usr/bin/env bash
# Lanzador para el ordenador de casa: abre la mesa en localhost o pasa las pruebas.
# Uso: scripts/mesa.sh [lanzar|pruebas|todo]   (sin argumento muestra un menú)
set -u
cd "$(dirname "$0")/.."

# Desde un acceso directo el PATH viene recortado: añade donde suele estar pnpm.
export PATH="$HOME/.local/bin:$HOME/.local/share/pnpm:$PATH"

WEB_URL="http://localhost:5173"

pausa() {
  # Si se abrió desde el menú de aplicaciones, que la ventana no se cierre sin leerla.
  [ -t 0 ] && read -rp $'\nPulsa Intro para cerrar...' _
}

comprobar() {
  if ! command -v node >/dev/null; then
    echo "❌ Falta Node.js (versión 22 o superior)."; pausa; exit 1
  fi
  if ! command -v pnpm >/dev/null; then
    echo "❌ Falta pnpm."; pausa; exit 1
  fi
  # Instala dependencias si faltan o si el lockfile ha cambiado desde la última vez.
  if [ ! -d node_modules ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
    echo "📦 Instalando dependencias..."
    pnpm install || { echo "❌ No se pudieron instalar las dependencias."; pausa; exit 1; }
  fi
}

pruebas() {
  local fallos=()
  echo "🔎 Comprobando tipos..."
  pnpm typecheck || fallos+=("comprobación de tipos")
  echo; echo "🧪 Ejecutando tests..."
  pnpm test || fallos+=("tests")
  echo
  if [ ${#fallos[@]} -eq 0 ]; then
    echo "✅ Todo en verde."
    return 0
  fi
  echo "❌ Ha fallado: ${fallos[*]}. Revisa los mensajes de arriba."
  return 1
}

lanzar() {
  echo "🚀 Arrancando la mesa (servidor en :3000, web en $WEB_URL)."
  echo "   Para pararla, pulsa Ctrl+C en esta ventana."
  # Abre el navegador cuando web y servidor respondan (como mucho espera un minuto).
  (
    for _ in $(seq 60); do
      if curl -sf -o /dev/null "$WEB_URL/api/health"; then xdg-open "$WEB_URL" >/dev/null 2>&1; exit; fi
      sleep 1
    done
  ) &
  pnpm dev
}

comprobar

opcion="${1:-}"
if [ -z "$opcion" ]; then
  echo "🎲 Mesa de Rol — ¿qué quieres hacer?"
  echo "  1) Abrir la mesa en el navegador"
  echo "  2) Pasar las pruebas"
  echo "  3) Pasar las pruebas y, si todo va bien, abrir la mesa"
  read -rp "Elige 1, 2 o 3: " num
  case "$num" in
    1) opcion=lanzar ;;
    2) opcion=pruebas ;;
    3) opcion=todo ;;
    *) echo "Opción no válida."; pausa; exit 1 ;;
  esac
fi

case "$opcion" in
  lanzar) lanzar ;;
  pruebas) pruebas; estado=$?; pausa; exit $estado ;;
  todo) if pruebas; then echo; lanzar; else pausa; exit 1; fi ;;
  *) echo "Uso: scripts/mesa.sh [lanzar|pruebas|todo]"; exit 1 ;;
esac
