# Guía exhaustiva: crear un agente con OpenCode en cualquier entorno

> Alcance: implementación funcional de un agente OpenCode portable (local, VM o contenedor), sin depender de Trident.

---

## 1) Objetivo

Esta guía te enseña a crear un agente OpenCode desde cero para cualquier entorno.  
Caso de uso principal: un agente que pueda conectarse a PostgreSQL y responder preguntas en lenguaje natural usando la información de la base de datos.

---

## 2) Requisitos mínimos

## 2.1 Sistema

- Linux/macOS/WSL (también sirve en contenedor)
- Node.js 18+ y npm
- Python 3.10+ (si usarás cliente en Python)
- `curl` y `jq` (recomendado)

## 2.2 OpenCode CLI

Instalación (elige una):

```bash
npm install -g @opencode-ai/cli
```

o local al proyecto:

```bash
npm install @opencode-ai/cli
```

Verificación:

```bash
opencode --version
```

> Importante: **no existe un instalador separado para “OpenCode Server”**.  
> El servidor HTTP viene incluido en el CLI y se levanta con `opencode serve`.

## 2.3 Base de datos objetivo

Para PostgreSQL, necesitas:

- Host
- Puerto (normalmente 5432)
- Usuario
- Contraseña
- Nombre de base

Y tener instalado cliente `psql` en el entorno donde correrá el agente.

---

## 3) Archivos de configuración obligatorios

OpenCode usa dos archivos base:

- `~/.local/share/opencode/auth.json`
- `~/.config/opencode/opencode.json`

## 3.1 `auth.json`

Define credenciales del proveedor LLM.

Ejemplo:

```json
{
  "mi-provider": {
    "type": "api",
    "key": "TU_API_KEY"
  }
}
```

## 3.2 `opencode.json`

Define:

- Proveedor/modelos (`provider`)
- Modelo default (`model`)
- Permisos globales (`permission`)
- Agentes (`agent`)

Ejemplo mínimo funcional:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "mi-provider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Mi proveedor",
      "options": {
        "baseURL": "https://api.tu-proveedor.com/v1",
        "apiKey": "{env:OPENCODE_API_KEY}"
      },
      "models": {
        "mi-modelo": {
          "name": "Mi modelo",
          "limit": {
            "context": 200000,
            "output": 65536
          }
        }
      }
    }
  },
  "model": "mi-provider/mi-modelo",
  "permission": {
    "default": "allow",
    "bash": "allow",
    "edit": "allow",
    "write": "allow"
  },
  "agent": {
    "db_qa": {
      "model": "mi-provider/mi-modelo",
      "bash": true,
      "edit": false,
      "write": false,
      "permission": {
        "default": "allow",
        "bash": "allow"
      },
      "prompt": "Eres un analista de base de datos. Convierte preguntas en SQL SELECT seguro, ejecuta consultas en PostgreSQL con psql, responde en español con resultados claros y breves. Nunca inventes datos. Si faltan tablas o columnas, dilo explícitamente."
    }
  }
}
```

---

## 4) Variables de entorno recomendadas

Usa un `.env` local para no hardcodear secretos:

```bash
OPENCODE_API_KEY=tu_api_key
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=app_user
PGPASSWORD=app_password
PGDATABASE=app_db
```

Carga rápida:

```bash
set -a
source .env
set +a
```

---

## 5) Formas de ejecutar el agente

## 5.1 Modo CLI directo (rápido)

```bash
echo "¿Cuántos clientes activos hay por país?" | opencode run --agent db_qa --format json
```

Útil para validación inicial de prompt y permisos.

## 5.2 Modo servidor HTTP (recomendado para apps)

Inicia servidor OpenCode:

```bash
opencode serve --hostname 0.0.0.0 --port 4096
```

Si `opencode --version` funciona, ya tienes también el componente servidor disponible.

Healthcheck:

```bash
curl -s http://127.0.0.1:4096/global/health | jq .
```

Esperado:

```json
{"healthy": true}
```

---

## 6) Flujo API HTTP completo

## 6.1 Crear sesión

```bash
curl -s -X POST http://127.0.0.1:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"db_qa_session"}' | jq .
```

Guarda `id`.

## 6.2 Enviar pregunta (sync)

```bash
curl -s -X POST http://127.0.0.1:4096/session/<SESSION_ID>/message \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [{"type": "text", "text": "¿Cuál fue el top 5 de productos por ingresos el último mes?"}],
    "agent": "db_qa"
  }' | jq .
```

## 6.3 Enviar pregunta (async)

```bash
curl -i -X POST http://127.0.0.1:4096/session/<SESSION_ID>/prompt_async \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [{"type": "text", "text": "Dame el total de ventas por semana."}],
    "agent": "db_qa"
  }'
```

Luego consulta estado:

```bash
curl -s http://127.0.0.1:4096/session/status | jq .
```

Y mensajes:

```bash
curl -s http://127.0.0.1:4096/session/<SESSION_ID>/message | jq .
```

---

## 7) Cliente Python mínimo (sin logs)

```python
import requests
import time

BASE = "http://127.0.0.1:4096"
AGENT = "db_qa"

def ask_db(question: str):
    health = requests.get(f"{BASE}/global/health", timeout=5).json()
    if not health.get("healthy"):
        raise RuntimeError("OpenCode no está healthy")

    sid = requests.post(
        f"{BASE}/session",
        json={"title": "db_qa"},
        timeout=20,
    ).json()["id"]

    requests.post(
        f"{BASE}/session/{sid}/prompt_async",
        json={
            "parts": [{"type": "text", "text": question}],
            "agent": AGENT,
        },
        timeout=30,
    ).raise_for_status()

    for _ in range(120):
        st = requests.get(f"{BASE}/session/status", timeout=10).json().get(sid)
        s = str(st).lower()
        if (not s) or any(x in s for x in ("completed", "idle", "done", "ready", "error", "failed")):
            break
        time.sleep(2)

    messages = requests.get(f"{BASE}/session/{sid}/message", timeout=30).json()
    return messages

if __name__ == "__main__":
    q = "¿Cuántos usuarios se registraron en los últimos 7 días?"
    print(ask_db(q))
```

---

## 8) Diseño del prompt para preguntas sobre base de datos

Para un agente tipo Q&A de BD, incluye estas reglas en `prompt`:

1. Traduce la pregunta natural a SQL.
2. Usa solo `SELECT` por defecto (evita `INSERT/UPDATE/DELETE` salvo permiso explícito).
3. Si no conoce el esquema, primero inspecciona tablas y columnas.
4. Si la consulta falla, corrige y reintenta.
5. Responde con:
   - resumen breve,
   - SQL ejecutado,
   - resultado tabular o agregado.
6. Nunca inventar datos.

Prompt sugerido:

```text
Eres un asistente de consultas PostgreSQL. Tu trabajo es responder preguntas de negocio usando datos reales de la base.
Reglas:
- Convierte cada pregunta a SQL SELECT seguro.
- Si no conoces el esquema, explora primero information_schema y luego consulta.
- Ejecuta consultas con psql usando variables de entorno PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
- Si hay error SQL, corrige y reintenta una vez.
- No inventes resultados.
- Responde en español con: (1) respuesta breve, (2) SQL usado, (3) resultado.
```

---

## 9) Seguridad mínima recomendada

- Usa un usuario de solo lectura en PostgreSQL para este agente.
- Limita permisos de OpenCode (`bash` solo lo necesario).
- Evita incluir secretos directamente en `opencode.json`.
- Usa red privada/VPN si expones `opencode serve` fuera de localhost.

---

## 10) Problemas comunes

## 10.1 `Agent 'db_qa' not found`

- El nombre no coincide con `opencode.json`.
- No recargaste OpenCode tras editar config.

Valida:

```bash
opencode validate-config
```

## 10.2 El agente responde sin consultar BD

- Prompt ambiguo.
- Falta `psql` o variables `PG*`.

Acción:

- Endurece prompt con “no inventes datos”.
- Verifica conexión manual:

```bash
PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c "SELECT 1;"
```

## 10.3 `health` falla

- `opencode serve` no está corriendo.

Inicia:

```bash
opencode serve --hostname 0.0.0.0 --port 4096
```

---

## 11) Checklist final

- [ ] `opencode --version` funciona
- [ ] `auth.json` existe y tiene API key válida
- [ ] `opencode.json` válido (`opencode validate-config`)
- [ ] agente `db_qa` definido
- [ ] `opencode serve` activo
- [ ] `GET /global/health` devuelve `healthy=true`
- [ ] consulta de prueba responde con datos reales de la BD

Con este checklist en verde ya tienes un agente OpenCode portable, independiente de Trident, listo para responder preguntas sobre tu base de datos.
