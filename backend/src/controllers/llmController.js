const { askMysqlAssistant } = require('../services/llmChatService');

exports.query = async (req, res, next) => {
  try {
    const { question } = req.body;

    const result = await askMysqlAssistant(question);

    res.json({
      question: String(question || '').trim(),
      answer: result.answer,
      mode: result.mode,
      queries: result.queries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (/obligatoria|máximo/i.test(error.message || '')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.code === 'LLM_NOT_CONFIGURED') {
      console.error('[LLM] Configuración inválida:', error.message);
      return res.status(503).json({
        error: 'El asistente no está configurado correctamente. Revisá la clave del proveedor en el servidor.',
      });
    }

    if (error.code === 'LLM_TIMEOUT') {
      return res.status(504).json({
        error: 'El asistente tardó demasiado en responder. Probá con una consulta más específica.',
      });
    }

    if (error.code === 'LLM_UNAVAILABLE') {
      console.error('[LLM] Proveedor no disponible:', error.message);
      return res.status(503).json({
        error: 'El asistente no está disponible en este momento. Intentá nuevamente en unos minutos.',
      });
    }

    return next(error);
  }
};
