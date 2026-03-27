const { askMysqlAssistant } = require('../services/llmChatService');

exports.query = async (req, res, next) => {
  try {
    const { question } = req.body;

    const result = await askMysqlAssistant(question);

    res.json({
      question: String(question || '').trim(),
      answer: result.answer,
      mode: result.mode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (
      /obligatoria|máximo/i.test(error.message || '')
    ) {
      return res.status(400).json({ error: error.message });
    }

    if (/opencode/i.test(error.message || '')) {
      return res.status(503).json({
        error: 'El asistente no está disponible en este momento. Intenta nuevamente o usa una consulta SQL de solo lectura.',
      });
    }

    return next(error);
  }
};
