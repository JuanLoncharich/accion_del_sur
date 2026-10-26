/**
 * Asistente de consultas en lenguaje natural sobre la base MySQL.
 *
 * El flujo es un bucle corto de "text-to-SQL":
 *   1. Se le entrega al modelo el esquema real (leído de information_schema).
 *   2. El modelo responde JSON: {"sql": "..."} para pedir datos, o {"answer": "..."} para cerrar.
 *   3. El SQL se valida como solo-lectura y se ejecuta con la conexión del proyecto.
 *   4. El resultado se devuelve al modelo hasta que produce una respuesta final.
 *
 * No depende de ningún binario externo: habla directo con una API chat
 * compatible con OpenAI (configurable por LLM_BASE_URL).
 */
const sequelize = require('../config/database');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5.4-mini';

const MAX_QUESTION_LENGTH = 2000;
const MAX_STEPS = 4;
const MAX_ROWS = 50;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_COMPLETION_TOKENS = 2000;
const SCHEMA_CACHE_TTL_MS = 10 * 60 * 1000;

/** Tablas que el asistente puede consultar. */
const ALLOWED_TABLES = [
  'categories',
  'category_attributes',
  'centers',
  'distributions',
  'donation_reception_details',
  'donation_receptions',
  'donations',
  'items',
  'token_transfers',
  'users',
];

/** Columnas sensibles: nunca se exponen al modelo ni al usuario. */
const BLOCKED_COLUMNS = [
  'password_hash',
  'donor_email',
  'donor_email_salt',
  'donor_email_hash',
  'receiver_identifier',
  'receiver_hash',
  'recipient_commitment',
  'recipient_salt',
  'signature_data',
  'signature_hash',
  'receipt_payload',
  'capture_ip',
  'capture_device',
  'requester_ip',
  'requester_device',
  'public_token_qr',
  'nonce',
];

const READONLY_SQL_REGEX = /^\s*(select|with)\s+/i;
const FORBIDDEN_SQL_REGEX =
  /(^|[^a-z_])(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|commit|rollback|lock|unlock|call|load_file|outfile|dumpfile|information_schema|mysql\.|performance_schema)([^a-z_]|$)/i;

const RELATIONS_HINT = `
Relaciones y semántica del negocio:
- items = lotes de insumos en stock. items.quantity es el stock actual; items.current_center_id indica en qué centro está.
- items.category_id -> categories.id.
- donations = ingresos de donaciones (item_id, quantity, center_id, created_at).
- donation_receptions + donation_reception_details = recepción de donaciones vía QR (status: pending/confirmed/rejected según el enum de la tabla).
- token_transfers = movimientos internos de stock entre centros (from_center_id -> to_center_id). NO son entregas al beneficiario.
- distributions = entregas finales al beneficiario; descuentan stock definitivamente. status='anchored' significa entrega confirmada y registrada en blockchain.
- centers = centros de recepción/distribución. centers.is_active indica si opera.
- users.role puede ser 'admin' o 'operador'/'voluntario' según los datos.
Diferencia clave: transferir mueve stock entre centros, distribuir lo entrega a una persona y lo saca del inventario.
`.trim();

function buildSystemPrompt(schemaText) {
  return [
    'Eres el asistente de análisis de datos de Acción del Sur (gestión de donaciones).',
    'Respondes SIEMPRE en español, para una persona no técnica, y NUNCA inventas datos.',
    '',
    'Esquema real de la base MySQL (no existen otras tablas):',
    schemaText,
    '',
    RELATIONS_HINT,
    '',
    'Cómo trabajas: respondes ÚNICAMENTE con un objeto JSON, sin texto alrededor y sin bloques de código.',
    'Para consultar datos:  {"sql": "SELECT ..."}',
    'Para responder al usuario: {"answer": "..."}',
    '',
    'Reglas de SQL:',
    '- Solo SELECT o WITH. Nada de INSERT/UPDATE/DELETE/DDL ni varias sentencias en una.',
    '- Una sola consulta por paso. Podés pedir hasta ' + MAX_STEPS + ' consultas en total.',
    `- Siempre incluí LIMIT (máximo ${MAX_ROWS} filas).`,
    '- Nunca uses SELECT *: nombrá las columnas.',
    `- Está prohibido consultar estas columnas sensibles: ${BLOCKED_COLUMNS.join(', ')}.`,
    '',
    'Reglas de la respuesta final:',
    '- Basala solo en los resultados reales que recibiste. Si los datos no alcanzan, decilo.',
    '- No menciones SQL, tablas, base de datos ni detalles técnicos.',
    '- Sé breve y concreto: 1 a 3 frases, con los números encontrados.',
  ].join('\n');
}

/* ── Esquema ─────────────────────────────────────────────────────────── */

let schemaCache = { text: null, expiresAt: 0 };

async function getSchemaText() {
  if (schemaCache.text && Date.now() < schemaCache.expiresAt) {
    return schemaCache.text;
  }

  const rows = await sequelize.query(
    `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
       FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (:tables)
      ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    {
      replacements: { tables: ALLOWED_TABLES },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const byTable = new Map();
  for (const row of rows) {
    if (BLOCKED_COLUMNS.includes(row.COLUMN_NAME)) continue;
    if (!byTable.has(row.TABLE_NAME)) byTable.set(row.TABLE_NAME, []);
    // Los ENUM se describen completos para que el modelo use los valores correctos.
    const type = /^enum/i.test(row.COLUMN_TYPE) ? row.COLUMN_TYPE : row.DATA_TYPE;
    byTable.get(row.TABLE_NAME).push(`${row.COLUMN_NAME} ${type}`);
  }

  if (byTable.size === 0) {
    throw new Error('No se pudo leer el esquema de la base de datos.');
  }

  const text = [...byTable.entries()]
    .map(([table, columns]) => `- ${table}(${columns.join(', ')})`)
    .join('\n');

  schemaCache = { text, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS };
  return text;
}

/* ── SQL de solo lectura ─────────────────────────────────────────────── */

function assertReadOnlySql(sql) {
  const normalized = String(sql || '').trim().replace(/;\s*$/, '');

  if (!normalized) {
    throw new Error('El asistente generó una consulta vacía.');
  }
  if (normalized.includes(';')) {
    throw new Error('No se permite ejecutar varias sentencias.');
  }
  if (!READONLY_SQL_REGEX.test(normalized)) {
    throw new Error('Solo se permiten consultas de lectura (SELECT / WITH).');
  }
  if (FORBIDDEN_SQL_REGEX.test(normalized)) {
    throw new Error('La consulta contiene instrucciones no permitidas.');
  }

  const lower = normalized.toLowerCase();
  const blocked = BLOCKED_COLUMNS.find((column) => new RegExp(`\\b${column}\\b`, 'i').test(lower));
  if (blocked) {
    throw new Error(`La consulta accede a un dato sensible (${blocked}) y fue bloqueada.`);
  }
  if (/select\s+\*/i.test(normalized)) {
    throw new Error('No se permite SELECT *: hay que nombrar las columnas.');
  }

  return normalized;
}

async function runReadonlySql(sql) {
  const safeSql = assertReadOnlySql(sql);

  const rows = await sequelize.query(safeSql, { type: sequelize.QueryTypes.SELECT });
  const limited = rows.slice(0, MAX_ROWS);

  return {
    sql: safeSql,
    rowCount: rows.length,
    rows: limited,
    truncated: rows.length > limited.length,
  };
}

/* ── Cliente LLM (API compatible con OpenAI) ─────────────────────────── */

function readEnvValue(name) {
  const raw = process.env[name];
  if (typeof raw !== 'string') return '';

  // El .env puede traer el valor entrecomillado; dotenv no siempre lo limpia.
  let value = raw.trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function getLlmConfig() {
  const apiKey = readEnvValue('LLM_API_KEY') || readEnvValue('OPENAI_API_KEY');
  if (!apiKey) {
    const error = new Error('Falta configurar OPENAI_API_KEY (o LLM_API_KEY) en el archivo .env del backend.');
    error.code = 'LLM_NOT_CONFIGURED';
    throw error;
  }

  return {
    apiKey,
    baseUrl: (readEnvValue('LLM_BASE_URL') || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: readEnvValue('LLM_MODEL') || DEFAULT_MODEL,
  };
}

/**
 * Los modelos gpt-5.x usan `max_completion_tokens`; los anteriores y varios
 * proveedores compatibles solo entienden `max_tokens`. Se prueba el primero y
 * se reintenta con el segundo si la API lo rechaza.
 */
let tokenLimitParam = 'max_completion_tokens';

async function postChatCompletion(baseUrl, apiKey, body, signal) {
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function callChatCompletion(messages) {
  const { apiKey, baseUrl, model } = getLlmConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const buildBody = () => ({
    model,
    messages,
    temperature: 0,
    [tokenLimitParam]: MAX_COMPLETION_TOKENS,
  });

  let response;
  try {
    response = await postChatCompletion(baseUrl, apiKey, buildBody(), controller.signal);

    if (response.status === 400) {
      const clone = await response.clone().json().catch(() => null);
      const message = clone?.error?.message || '';
      if (/max_completion_tokens|max_tokens/i.test(message)) {
        tokenLimitParam = tokenLimitParam === 'max_completion_tokens' ? 'max_tokens' : 'max_completion_tokens';
        response = await postChatCompletion(baseUrl, apiKey, buildBody(), controller.signal);
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('El asistente tardó demasiado en responder.');
      timeoutError.code = 'LLM_TIMEOUT';
      throw timeoutError;
    }
    const netError = new Error(`No se pudo contactar al proveedor del asistente: ${error.message}`);
    netError.code = 'LLM_UNAVAILABLE';
    throw netError;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const apiError = new Error(`El proveedor del asistente rechazó la consulta: ${detail}`);
    apiError.code = response.status === 401 || response.status === 403 ? 'LLM_NOT_CONFIGURED' : 'LLM_UNAVAILABLE';
    throw apiError;
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const emptyError = new Error('El asistente no devolvió una respuesta utilizable.');
    emptyError.code = 'LLM_UNAVAILABLE';
    throw emptyError;
  }

  return content.trim();
}

/**
 * El modelo debería devolver JSON puro, pero suele envolverlo en ```json … ```
 * o agregar texto alrededor; se rescata el primer objeto válido.
 */
function parseModelDecision(content) {
  const withoutFences = content.replace(/```(?:json)?/gi, '').trim();
  const candidates = [withoutFences];

  const firstBrace = withoutFences.indexOf('{');
  const lastBrace = withoutFences.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(withoutFences.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.sql === 'string' && parsed.sql.trim()) {
          return { type: 'sql', sql: parsed.sql.trim() };
        }
        if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
          return { type: 'answer', answer: parsed.answer.trim() };
        }
      }
    } catch (_) {
      // Seguimos con el siguiente candidato.
    }
  }

  // Si no vino JSON pero sí texto plano, lo tomamos como respuesta final.
  return { type: 'answer', answer: withoutFences };
}

/* ── Orquestación ────────────────────────────────────────────────────── */

function validateQuestion(question) {
  if (typeof question !== 'string' || !question.trim()) {
    throw new Error('La consulta es obligatoria.');
  }

  const normalized = question.trim();
  if (normalized.length > MAX_QUESTION_LENGTH) {
    throw new Error(`La consulta supera el máximo de ${MAX_QUESTION_LENGTH} caracteres.`);
  }

  return normalized;
}

async function askMysqlAssistant(question) {
  const normalized = validateQuestion(question);
  const schemaText = await getSchemaText();

  const messages = [
    { role: 'system', content: buildSystemPrompt(schemaText) },
    { role: 'user', content: normalized },
  ];

  const executedQueries = [];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const content = await callChatCompletion(messages);
    const decision = parseModelDecision(content);

    if (decision.type === 'answer') {
      return {
        mode: 'sql-assistant',
        answer: decision.answer,
        queries: executedQueries,
      };
    }

    messages.push({ role: 'assistant', content });

    let observation;
    try {
      const result = await runReadonlySql(decision.sql);
      executedQueries.push(result.sql);
      observation = JSON.stringify({
        rowCount: result.rowCount,
        truncated: result.truncated,
        rows: result.rows,
      });
    } catch (error) {
      observation = JSON.stringify({ error: error.message });
    }

    const isLastStep = step === MAX_STEPS - 1;
    messages.push({
      role: 'user',
      content: isLastStep
        ? `Resultado: ${observation}\n\nNo quedan más consultas disponibles. Respondé ahora con {"answer": "..."}.`
        : `Resultado: ${observation}\n\nSi ya tenés lo necesario respondé con {"answer": "..."}; si no, pedí otra consulta con {"sql": "..."}.`,
    });
  }

  const exhausted = new Error('El asistente no logró resolver la consulta con los datos disponibles.');
  exhausted.code = 'LLM_UNAVAILABLE';
  throw exhausted;
}

module.exports = {
  askMysqlAssistant,
  // Exportados para pruebas y diagnóstico.
  assertReadOnlySql,
  getSchemaText,
};
