# Despliegue

El sistema corre en una sola máquina, sin Docker: MySQL 8, el backend Node y el frontend
compilado. Hay dos formas de publicarlo:

| | Opción A — servicios de usuario | Opción B — Nginx + systemd del sistema |
|---|---|---|
| Requiere sudo | No | Sí |
| Frontend | `vite preview` en `:5020` | Nginx en `:80` sirviendo `frontend/dist` |
| Backend | servicio de usuario en `:3020` | servicio del sistema en `127.0.0.1:3020` |
| Estado | **Es lo que corre hoy en la VM** (`http://10.147.19.102:5020`) | Documentada, no instalada (requiere un administrador) |

## Preparación (ambas opciones)

```bash
git clone git@github.com:JuanLoncharich/accion_del_sur.git
cd accion_del_sur

# Base de datos
mysql -u root -p -e "CREATE DATABASE accion_del_sur CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Backend
cd backend
cp .env.example .env            # completar DB_*, JWT_SECRET (openssl rand -hex 48), PORT, FRONTEND_URL, SMTP_*
chmod 600 .env
npm ci --omit=dev
npm run seed                    # opcional: datos de demostración (cambiar contraseñas después)

# Frontend
cd ../frontend
npm ci
npm run build                   # genera frontend/dist/
```

### Activar la blockchain (opcional)

Detalle en [blockchain.md](blockchain.md). Los WASM se compilan en cualquier máquina con Rust
(no hace falta Rust en el servidor; se copian a `contracts/target/wasm32v1-none/release/`):

```bash
cd contracts && stellar contract build          # o: cargo build --target wasm32v1-none --release
cd ../backend
npm run stellar:cuenta                           # cuenta admin nueva en testnet → backend/.env
npm run stellar:desplegar                        # contratos → backend/.env (STELLAR_ENABLED=true)
npm run stellar:sincronizar                      # contratos de centros + stock existente
```

Reiniciar el backend después de cambiar `backend/.env`.

## Opción A — servicios systemd de usuario (sin sudo)

Requiere que el usuario tenga *linger* activado (`loginctl show-user $USER | grep Linger` →
`Linger=yes`), para que los servicios sigan corriendo sin sesión abierta.

```bash
mkdir -p ~/.config/systemd/user
cp deploy/systemd/user/*.service ~/.config/systemd/user/
# Ajustar WorkingDirectory, puertos y API_URL si el repo no está en /home/shared/proyecto_cgic/accion_del_sur_final
systemctl --user daemon-reload
systemctl --user enable --now accion-del-sur-backend accion-del-sur-frontend
```

Verificar y operar:

```bash
systemctl --user status accion-del-sur-backend accion-del-sur-frontend
journalctl --user -u accion-del-sur-backend -n 50 --no-pager
curl -s http://localhost:3020/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5020/api/health   # proxy del frontend
```

`FRONTEND_URL` en `backend/.env` debe ser la URL pública del frontend (`http://10.147.19.102:5020`):
se usa para CORS y para los links de los QR de recepción.

Actualizar una versión:

```bash
git pull
(cd backend && npm ci --omit=dev)
(cd frontend && npm ci && npm run build)
systemctl --user restart accion-del-sur-backend accion-del-sur-frontend
```

Las columnas nuevas de la base se crean solas al arrancar (`backend/src/config/ensureSchema.js`).

## Opción B — Nginx + systemd del sistema

### Contenido de `deploy/`

| Archivo | Destino | Qué hace |
|---|---|---|
| `nginx/accion-del-sur.conf` | `/etc/nginx/sites-available/accion-del-sur` | Sirve `frontend/dist` y hace de proxy de `/api` y `/uploads` a `127.0.0.1:3020`. |
| `systemd/accion-del-sur-backend.service` | `/etc/systemd/system/` | Backend con `NODE_ENV=production`, reinicio automático. |
| `scripts/backup_db.sh` | se ejecuta desde el repo | `mysqldump --single-transaction` + gzip + rotación de 7 días. |

### La máquina (relevado el 2026-10-03)

| Dato | Valor |
|---|---|
| Hostname | `instance-20251104-1550` |
| Tipo | VM de **Oracle Cloud (OCI)**, región `sa-santiago-1`, shape `VM.Standard.A1.Flex` (ARM64 Ampere), KVM |
| Sistema operativo | Ubuntu 24.04.4 LTS, kernel `6.17.0-1009-oracle` |
| Recursos | 4 vCPU, 23 GiB RAM, disco raíz de 193 GB **al 99 % (≈3 GB libres, 2026-10-26)** |
| IP pública | `136.248.240.73` (NAT de OCI hacia `10.0.0.195`) |
| IP privada (VCN) | `10.0.0.195` (`enp0s6`) |
| IP ZeroTier | `10.147.19.102` (`ztosicyaml`) |
| Software | Node v22.22.1, npm 10.9.4, MySQL 8.0.46 (activo). Nginx y Certbot **no instalados**. |
| Puerto 80 | **Ocupado solo en `127.0.0.1:80`** por el contenedor Docker `scl-dashboard` (otro proyecto). Libre en `10.0.0.195` y `10.147.19.102`. |
| Puerto 443 | Libre. |

Por el contenedor que ocupa `127.0.0.1:80`, la config de Nginx **no** usa `listen 80;` (que intentaría `0.0.0.0:80` y fallaría). Escucha solo en `10.0.0.195:80` y `10.147.19.102:80`.

### Requisitos previos

- Usuario con `sudo` (el usuario `juanloncha` no tiene sudo sin contraseña: los pasos con `sudo` los ejecuta un administrador).
- `backend/.env` completo (ver `backend/.env.example`).
- Repositorio en `/home/shared/proyecto_cgic/accion_del_sur_final`.

### Instalación paso a paso

Todos los comandos, desde la raíz del repositorio:

```bash
cd /home/shared/proyecto_cgic/accion_del_sur_final
```

#### 1. Dependencias y build

Ver «Preparación» más arriba.

#### 2. Build del frontend (sin sudo)

```bash
(cd frontend && npm run build)               # genera frontend/dist/
```

#### 3. Nginx (requiere sudo)

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

> El sitio `default` del paquete escucha en `0.0.0.0:80` y choca con `127.0.0.1:80` (scl-dashboard), así que el primer arranque de Nginx **puede fallar** durante la instalación. Es esperable: se corrige en los pasos siguientes. Si `apt` deja el paquete a medio configurar, después del paso 3.3 ejecutar `sudo dpkg --configure -a`.

```bash
# 3.1 Quitar el sitio por defecto
sudo rm -f /etc/nginx/sites-enabled/default

# 3.2 Copiar el build a un directorio legible por www-data (/home/shared es 770)
sudo mkdir -p /var/www/accion-del-sur
sudo rsync -a --delete frontend/dist/ /var/www/accion-del-sur/
sudo chown -R root:root /var/www/accion-del-sur

# 3.3 Instalar el sitio
sudo cp deploy/nginx/accion-del-sur.conf /etc/nginx/sites-available/accion-del-sur
sudo ln -sf /etc/nginx/sites-available/accion-del-sur /etc/nginx/sites-enabled/accion-del-sur

# 3.4 Permitir que Nginx se vincule a la IP ZeroTier aunque la interfaz levante después
echo 'net.ipv4.ip_nonlocal_bind=1' | sudo tee /etc/sysctl.d/60-nonlocal-bind.conf
sudo sysctl --system

# 3.5 Validar y arrancar
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

#### 4. Backend como servicio systemd (requiere sudo)

Si el backend corre como servicio de usuario (opción A) o con `start.sh`, detenerlo antes:

```bash
systemctl --user disable --now accion-del-sur-backend accion-del-sur-frontend 2>/dev/null; ./stop.sh

sudo cp deploy/systemd/accion-del-sur-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now accion-del-sur-backend
systemctl status accion-del-sur-backend --no-pager
journalctl -u accion-del-sur-backend -n 30 --no-pager
```

Editar `backend/.env` para que los links públicos (QR) apunten a Nginx, y reiniciar:

```bash
sed -i 's#^FRONTEND_URL=.*#FRONTEND_URL=http://10.147.19.102#' backend/.env
sudo systemctl restart accion-del-sur-backend
```

#### 5. Verificación (sin sudo)

```bash
curl -s http://10.147.19.102/api/health                       # {"status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' http://10.147.19.102/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://10.147.19.102/envios      # 200 (SPA)
curl -s -X POST http://10.147.19.102/api/auth/login \
  -H 'content-type: application/json' -d '{"username":"admin","password":"admin123"}' | head -c 60; echo
```

Abrir en el navegador: **http://10.147.19.102/** (desde la red ZeroTier).

> Si desde otra máquina de la red ZeroTier no responde (pero `curl` desde la propia VM sí), el firewall `iptables` de la VM está rechazando el puerto 80. Aplicar la regla de `iptables` del paso 6.2. No se pudo leer `iptables` sin sudo para confirmarlo de antemano.

#### 6. Acceso desde Internet (opcional, decisión del equipo)

La IP pública `136.248.240.73` solo funcionará si se abre el puerto 80:

1. **OCI:** en la Security List o NSG de la VCN, agregar una regla de ingreso TCP 80 (y 443 si se usa HTTPS).
2. **Firewall de la VM:** las imágenes Ubuntu de OCI traen reglas `iptables` que rechazan todo salvo SSH:
   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo netfilter-persistent save
   ```

> Sin HTTPS, las contraseñas viajan en texto plano. Para exponer el sistema a Internet hace falta un dominio que apunte a `136.248.240.73` y Certbot (`sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d <dominio>`). Certbot agregará `listen 443 ssl`, que debe seguir el mismo criterio de IP explícita (`10.0.0.195:443`). Mientras no haya dominio, se recomienda usarlo solo por ZeroTier.

#### 7. Backup diario de la base (sin sudo, crontab del usuario)

Probar una vez a mano:

```bash
deploy/scripts/backup_db.sh
ls -l ~/backups/accion_del_sur/
```

Agregar al crontab del usuario (`crontab -e`) esta línea (todos los días a las 03:15):

```cron
15 3 * * * /home/shared/proyecto_cgic/accion_del_sur_final/deploy/scripts/backup_db.sh >> /home/juanloncha/backups/accion_del_sur/backup.log 2>&1
```

Restaurar un backup:

```bash
gunzip -c ~/backups/accion_del_sur/accion_del_sur_AAAAMMDD-HHMMSS.sql.gz | mysql -u root -p accion_del_sur_final
```

> El disco está al 99 %. Cada dump comprimido pesa ≈5–10 KB hoy, pero conviene vigilar el espacio (`df -h /`) y, si es posible, copiar los backups fuera de la VM.

### Actualizar una versión ya desplegada

```bash
cd /home/shared/proyecto_cgic/accion_del_sur_final
git pull
(cd backend && npm install --omit=dev)
(cd frontend && npm run build)
sudo rsync -a --delete frontend/dist/ /var/www/accion-del-sur/
sudo systemctl restart accion-del-sur-backend
```

### Volver al modo desarrollo

```bash
sudo systemctl disable --now accion-del-sur-backend
./start.sh                                   # backend (PORT de backend/.env) + Vite :5000
```

### Problemas conocidos

| Síntoma | Causa | Solución |
|---|---|---|
| `bind() to 0.0.0.0:80 failed (98: Address already in use)` | El sitio `default` sigue habilitado o se usó `listen 80;` | `sudo rm /etc/nginx/sites-enabled/default`; usar las líneas `listen <IP>:80` del archivo provisto. |
| `bind() to 10.147.19.102:80 failed (99: Cannot assign requested address)` | ZeroTier no estaba levantado al arrancar Nginx | Paso 3.4 (`ip_nonlocal_bind`). |
| 502 Bad Gateway en `/api` | El backend no está corriendo | `systemctl status accion-del-sur-backend` / `journalctl -u accion-del-sur-backend`. |
| 413 al subir imagen | Imagen de más de 6 MB | El backend acepta hasta 5 MB (multer). |
