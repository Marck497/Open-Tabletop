# Jugar desde fuera de casa

La Pi sirve la web en el puerto `3000` de tu red local. Para que tus amigos entren desde su casa hay tres caminos. **Recomiendo el primero**: es gratis, no necesitas dominio ni tocar el router, y la conexión va cifrada (HTTPS).

> En los tres casos, pon `COOKIE_SECURE=true` en el `.env` (porque la web irá por HTTPS) y un `REGISTRATION_CODE` para que solo tus amigos puedan crear cuenta. Después, `docker compose up -d`.

---

## Opción A: Tailscale Funnel (gratis, sin dominio, recomendada)

Tailscale crea una dirección pública `https://<nombre-de-la-pi>.<tu-red>.ts.net` que apunta a la Pi. Tus amigos solo necesitan el enlace; no tienen que instalar nada.

1. En la Pi:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up            # abre el enlace que aparece e inicia sesión
   sudo tailscale funnel --bg 3000
   ```
2. La primera vez, el comando te dará un enlace para activar **HTTPS** y **Funnel** en tu cuenta de Tailscale. Actívalos y vuelve a lanzar el último comando.
3. `tailscale funnel status` te muestra la dirección pública. Compártela junto con el código de registro.

Para quitarlo: `sudo tailscale funnel --https=443 off`.

## Opción B: Cloudflare Tunnel (si tienes un dominio propio)

Ideal si quieres una dirección bonita como `rol.tudominio.com`. Tampoco hay que abrir puertos.

1. En el panel de Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo *Cloudflared*). Copia el *token*.
2. En **Public Hostname**, añade `rol.tudominio.com` con servicio `http://vtt:3000`.
3. En la Pi, añade al `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=el-token-copiado
   COOKIE_SECURE=true
   ```
4. Arranca con el archivo extra:
   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.cloudflare.yml up -d
   ```

## Opción C: Abrir un puerto del router (manual)

Solo si las anteriores no te sirven. Necesitas un dominio (vale uno gratuito de [DuckDNS](https://www.duckdns.org)) y redirigir los puertos **80 y 443** del router a la IP de la Pi.

```bash
# Pon tu dominio en deploy/Caddyfile y arranca con Caddy (obtiene el certificado HTTPS solo)
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
```

---

## Copias de seguridad

Todo vive en la carpeta `data/` (base de datos y archivos subidos). El script hace una copia consistente aunque el servidor esté en marcha:

```bash
./scripts/backup.sh            # deja un .tar.gz en backups/
```

Para hacerla cada noche a las 4:00, añade con `crontab -e`:

```
0 4 * * * cd /home/pi/Open-Tabletop && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Para restaurar: para el servidor (`docker compose down`), descomprime la copia sobre `data/` y vuelve a arrancar.
