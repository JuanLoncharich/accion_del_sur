# Agente OpenCode para MySQL (chat por terminal)

Esta carpeta implementa un agente `mysql_qa` para OpenCode que consulta la base de datos MySQL del proyecto.

## Qué usa del backend

El backend ya define MySQL con estas variables (`backend/.env`):

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

El script de consultas carga automáticamente esas variables.

Para el agente del LLM se recomienda usar credenciales dedicadas de solo lectura con estas variables (prioridad sobre `DB_*`):

- `LLM_DB_HOST`
- `LLM_DB_PORT`
- `LLM_DB_USER`
- `LLM_DB_PASSWORD`
- `LLM_DB_NAME`

## Archivos principales

- `agent_prompt_mysql.txt`: prompt del agente con reglas de seguridad.
- `setup-opencode.sh`: crea/actualiza los agentes `coder` y `mysql_qa` en `~/.config/opencode/opencode.json`.
- `opencode.json`: configuración local compatible para este proyecto (la usa el chat automáticamente).
- `scripts/mysql_readonly_query.sh`: ejecuta SQL en modo solo lectura.
- `scripts/chat_terminal.sh`: chat interactivo por terminal.

## Requisitos

- OpenCode CLI disponible: global (`opencode --version`) o por npx (`npx -y opencode-ai --version`)
- Cliente MySQL instalado (`mysql --version`)
- Configuración de proveedor/modelo LLM en OpenCode (según tu instalación actual)

## Configuración rápida

1. Desde esta carpeta:

```bash
cd backend/chatLLM
```

2. El setup toma modelo desde `backend/.env` (`OPENAI_MODEL`) y lo convierte a formato OpenCode (`openai/...`).

2.1 Configura credenciales del agente (idealmente en `backend/chatLLM/.env`) para que use el usuario restringido:

```bash
LLM_DB_HOST=localhost
LLM_DB_PORT=3306
LLM_DB_NAME=accion_del_sur
LLM_DB_USER=llm_reader
LLM_DB_PASSWORD=tu_password_llm_reader
```

3. (Opcional) si quieres forzar otro modelo para este agente:

```bash
export OPENCODE_AGENT_MODEL="tu-provider/tu-modelo"
```

4. Crear/actualizar agentes:

```bash
./setup-opencode.sh
```

5. Iniciar chat:

```bash
./scripts/chat_terminal.sh
```

## Usar chat por terminal

Escribe preguntas en español, por ejemplo:

- "¿Cuántos usuarios hay registrados?"
- "Dame las 10 donaciones más recientes"
- "Total distribuido por categoría"

Para salir, escribe `salir`.

## Seguridad aplicada

- El agente está instruido para usar solo consultas de lectura.
- `mysql_readonly_query.sh` bloquea palabras clave de escritura/modificación.
- Si no conoce el esquema, debe inspeccionar tablas/columnas primero.

## Nota de compatibilidad

En este entorno, el binario `opencode` disponible soporta modo no interactivo con `-p` y requiere un agente `coder` por defecto. Por eso `setup-opencode.sh` registra ambos (`coder` y `mysql_qa`) y `chat_terminal.sh` usa `opencode -p`.

Además, el setup deja `default_agent=mysql_qa` para evitar errores de resolución de agente.
`chat_terminal.sh` exporta `OPENCODE_CONFIG=backend/chatLLM/opencode.json` para usar siempre esta configuración local.
