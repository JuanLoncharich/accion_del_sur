const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '../..');
const chatLlmDir = path.join(backendRoot, 'chatLLM');
const promptPath = path.join(chatLlmDir, 'agent_prompt_mysql.txt');
const opencodeConfigPath = path.join(chatLlmDir, 'opencode.json');
const readonlyScriptPath = path.join(chatLlmDir, 'scripts', 'mysql_readonly_query.sh');
const projectRoot = path.resolve(backendRoot, '..');

const MAX_QUESTION_LENGTH = 2000;
const EXEC_TIMEOUT_MS = 90_000;

const FINAL_RESPONSE_APPEND = [
  '',
  'Instrucciones de salida FINAL (obligatorias):',
  '- En la respuesta final al usuario, muestra SOLO la respuesta final.',
  '- No muestres proceso, pasos, SQL ejecutado, tablas, comandos, razonamiento ni secciones.',
  '- No menciones base de datos, SQL, tablas, consultas, scripts, sistema interno ni aspectos técnicos.',
  '- Responde para una persona no técnica en español claro.',
  '- Usa un único bloque breve (máximo 2 frases).',
].join('\n');

const READONLY_SQL_REGEX = /^\s*(select|with|show|describe|desc|explain)\s+/i;

function runCommand(command, args, options = {}) {
  const {
    cwd = backendRoot,
    env = process.env,
    timeoutMs = EXEC_TIMEOUT_MS,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        child.kill('SIGTERM');
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      finished = true;
      reject(error);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      finished = true;

      if (signal === 'SIGTERM') {
        return reject(new Error(`Tiempo de espera excedido (${timeoutMs}ms).`));
      }

      resolve({
        code,
        stdout,
        stderr,
      });
    });
  });
}

function extractFinalTextFromOpencode(rawOutput) {
  const lines = rawOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const textParts = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.type === 'text' && typeof parsed?.part?.text === 'string') {
        textParts.push(parsed.part.text.trim());
      }
    } catch (_) {
      // Puede venir ruido no-JSON; lo ignoramos.
    }
  }

  return textParts.filter(Boolean).at(-1) || '';
}

function normalizeOpenAiKey(value) {
  if (typeof value !== 'string') return value;

  let normalized = value.trim();
  if (
    (normalized.startsWith("'") && normalized.endsWith("'")) ||
    (normalized.startsWith('"') && normalized.endsWith('"'))
  ) {
    normalized = normalized.slice(1, -1);
  }

  return normalized;
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function getNonEmptyTextLines(text) {
  return stripAnsi(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function detectOpencodeMode(env) {
  try {
    const help = await runCommand('opencode', ['--help'], {
      env,
      cwd: projectRoot,
      timeoutMs: 15_000,
    });

    const helpText = `${help.stdout || ''}\n${help.stderr || ''}`;
    if (/\bopencode\s+run\b/i.test(helpText)) {
      return 'run';
    }

    return 'legacy-p';
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function extractLegacyTextOutput(rawOutput) {
  const lines = getNonEmptyTextLines(rawOutput);
  if (lines.length === 0) return '';

  const filtered = lines.filter((line) => {
    return !/^\[[^\]]+\]/.test(line) && !/^opencode\b/i.test(line);
  });

  return (filtered.length ? filtered : lines).join('\n').trim();
}

async function runWithOpencodeRun(finalPrompt, env) {
  const result = await runCommand(
    'opencode',
    ['run', '--agent', 'mysql_qa', '--format', 'json', finalPrompt],
    { env, cwd: projectRoot }
  );

  const parsed = extractFinalTextFromOpencode(result.stdout);
  const fallbackText = (result.stdout || result.stderr).trim();

  if (result.code !== 0) {
    const message = fallbackText || 'No se pudo ejecutar el asistente LLM.';
    throw new Error(message.split('\n').slice(-3).join(' ').trim());
  }

  const answer = parsed || fallbackText;
  if (!answer) {
    throw new Error('El asistente no devolvió una respuesta utilizable.');
  }

  return {
    mode: 'opencode-run',
    answer,
  };
}

async function runWithOpencodeLegacy(finalPrompt, env) {
  const result = await runCommand('opencode', ['-p', finalPrompt], {
    env,
    cwd: projectRoot,
  });

  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();

  if (result.code !== 0) {
    const message = combinedOutput || 'No se pudo ejecutar el asistente LLM.';
    throw new Error(message.split('\n').slice(-3).join(' ').trim());
  }

  const answer = extractLegacyTextOutput(result.stdout) || extractLegacyTextOutput(combinedOutput);
  if (!answer) {
    throw new Error('El asistente no devolvió una respuesta utilizable en modo legacy.');
  }

  return {
    mode: 'opencode-legacy-p',
    answer,
  };
}

async function runWithOpencode(question) {
  if (!fs.existsSync(promptPath)) {
    throw new Error('No se encontró agent_prompt_mysql.txt en chatLLM.');
  }

  const basePrompt = fs.readFileSync(promptPath, 'utf8');
  const finalPrompt = `${basePrompt}\n${FINAL_RESPONSE_APPEND}\n\nPregunta del usuario:\n${question}`;

  const env = {
    ...process.env,
    OPENCODE_CONFIG: fs.existsSync(opencodeConfigPath) ? opencodeConfigPath : process.env.OPENCODE_CONFIG,
  };

  if (typeof env.OPENAI_API_KEY === 'string') {
    env.OPENAI_API_KEY = normalizeOpenAiKey(env.OPENAI_API_KEY);
  }

  const mode = await detectOpencodeMode(env);
  if (!mode) {
    const missingError = new Error('opencode no está disponible en PATH.');
    missingError.code = 'ENOENT';
    throw missingError;
  }

  if (mode === 'run') {
    return runWithOpencodeRun(finalPrompt, env);
  }

  return runWithOpencodeLegacy(finalPrompt, env);
}

async function runReadonlySql(sql) {
  if (!fs.existsSync(readonlyScriptPath)) {
    throw new Error('No se encontró mysql_readonly_query.sh.');
  }

  const result = await runCommand(readonlyScriptPath, [sql], {
    cwd: path.resolve(backendRoot, '..'),
  });

  if (result.code !== 0) {
    const errorText = (result.stderr || result.stdout || 'Error ejecutando SQL de solo lectura').trim();
    throw new Error(errorText);
  }

  return {
    mode: 'readonly-sql-fallback',
    answer: result.stdout.trim() || '(sin salida)',
  };
}

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

  try {
    return await runWithOpencode(normalized);
  } catch (error) {
    const isMissingOpencode =
      error.code === 'ENOENT' ||
      /opencode/i.test(error.message || '');

    if (isMissingOpencode && READONLY_SQL_REGEX.test(normalized)) {
      return runReadonlySql(normalized);
    }

    throw error;
  }
}

module.exports = {
  askMysqlAssistant,
};
