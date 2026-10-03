const { sequelize } = require('../models');

/**
 * Borra `model` con id `id` solo si no tiene dependencias.
 * - Bloquea la fila (FOR UPDATE) dentro de una transacción: las inserciones que la
 *   referencian por FK esperan, así el conteo no queda desactualizado antes del destroy.
 * - `dependencies(transaction)` devuelve [{ label, count }].
 * Respuestas: 404 si no existe, 409 { error, dependencies } si hay dependencias, 200 si borró.
 */
const destroyIfUnused = async (res, { model, id, entity, notFound, deleted, dependencies, beforeDestroy }) => {
  const transaction = await sequelize.transaction();
  try {
    const record = await model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!record) { await transaction.rollback(); return res.status(404).json({ error: notFound }); }

    if (beforeDestroy) {
      const veto = await beforeDestroy(record);
      if (veto) { await transaction.rollback(); return res.status(veto.status).json({ error: veto.error }); }
    }

    const blocking = (await dependencies(record, transaction)).filter((d) => d.count > 0);
    if (blocking.length) {
      await transaction.rollback();
      const detail = blocking.map((d) => `${d.count} ${d.label}`).join(', ');
      return res.status(409).json({
        error: `No se puede eliminar ${entity}: tiene ${detail}. Reasigná o eliminá esos registros primero.`,
        dependencies: Object.fromEntries(blocking.map((d) => [d.label, d.count])),
      });
    }

    await record.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: deleted });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
};

module.exports = { destroyIfUnused };
