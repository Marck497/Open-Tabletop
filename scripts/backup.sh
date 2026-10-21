#!/usr/bin/env sh
# Copia de seguridad de la mesa: base de datos (copia consistente en caliente) + archivos subidos.
set -eu
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p backups

# better-sqlite3 hace la copia sin parar el servidor.
docker compose exec -T vtt node -e "require('better-sqlite3')('/data/vtt.db').backup('/data/backup.db').then(() => console.log('Base de datos copiada'))"

tar -czf "backups/vtt-$STAMP.tar.gz" -C data backup.db uploads 2>/dev/null || tar -czf "backups/vtt-$STAMP.tar.gz" -C data backup.db
docker compose exec -T vtt rm -f /data/backup.db
echo "Copia creada: backups/vtt-$STAMP.tar.gz"

# Conserva solo las 14 copias más recientes.
ls -1t backups/vtt-*.tar.gz | tail -n +15 | xargs -r rm -f
