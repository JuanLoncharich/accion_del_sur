/**
 * anclaje.js — Reflejo en blockchain de los movimientos de inventario.
 *
 * Invariante: el saldo SFT de un centro para un insumo es igual al stock del insumo en la base
 * cuando el insumo está ubicado en ese centro.
 *
 *   Donación registrada / recepción finalizada → mint     (sube el stock)
 *   Transferencia entre centros               → transfer (ver transferController)
 *   Envío confirmado                          → burn     (baja el stock)
 *
 * La base de datos es la fuente de verdad operativa: primero se confirma la transacción en MySQL
 * y después se ancla. Si la blockchain está apagada o falla, la operación queda registrada en
 * la base con estado `local` y se puede reconciliar con `npm run stellar:sincronizar`.
 *
 * Estados: 'anchored' (confirmado on-chain) · 'local' (falló o el centro no tiene contrato) ·
 * 'disabled' (STELLAR_ENABLED=false).
 */

const crypto = require('crypto');
const stellarService = require('./stellarService');
const sftService = require('./sftService');

const ZERO_HASH = '0'.repeat(64);
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const disabled = () => ({ status: 'disabled', txId: null });

const local = (error) => {
  if (error) console.error('[Anclaje] Queda en local:', error.message || error);
  return { status: 'local', txId: null, error: error ? String(error.message || error) : null };
};

const centerGeoHash = (center) => sha256(`${center.name}|${center.location || ''}`);

/**
 * Despliega el contrato de identidad de un centro y guarda su dirección en el modelo.
 */
async function desplegarCentro(center) {
  if (!stellarService.isEnabled) return disabled();
  if (center.blockchain_contract_id) return { status: 'anchored', txId: center.blockchain_deploy_tx || null };
  try {
    const { contractId, txId } = await stellarService.deployCenterContract({
      nombre: center.name,
      geo_hash: centerGeoHash(center),
    });
    await center.update({ blockchain_contract_id: contractId, blockchain_deploy_tx: txId });
    return { status: 'anchored', txId };
  } catch (error) {
    return local(error);
  }
}

/**
 * Mintea `cantidad` unidades del insumo al centro donde está ubicado.
 * `item` debe venir con `category` incluida y `center` es su centro actual.
 */
async function mintearIngreso({ item, center, cantidad, firmaHash }) {
  if (!sftService.isEnabled) return disabled();
  if (!center || !center.blockchain_contract_id) return local('el centro no tiene contrato desplegado');
  try {
    const tokenId = item.token_id || sftService.computeTokenId(item.id);
    const r = await sftService.mintToCenter({
      toCenterAddress: center.blockchain_contract_id,
      tokenId,
      metadata: {
        item_id: item.id,
        categoria: item.category ? item.category.name : '',
        nombre: item.name,
        attributes_hash: item.attributes_hash || ZERO_HASH,
      },
      cantidad: Number(cantidad),
      firmaHash: firmaHash || ZERO_HASH,
    });
    if (!item.token_id) await item.update({ token_id: tokenId });
    return { status: 'anchored', txId: r.txId };
  } catch (error) {
    return local(error);
  }
}

/**
 * Quema `cantidad` unidades del insumo en su centro al salir del inventario (envío confirmado).
 * `referencia` identifica la salida (p. ej. 'envio:12:destino:3') y queda como commitment on-chain.
 */
async function quemarSalida({ item, center, cantidad, referencia, operatorId }) {
  if (!sftService.isEnabled) return disabled();
  if (!center || !center.blockchain_contract_id) return local('el centro no tiene contrato desplegado');
  try {
    const r = await sftService.burnForDistribution({
      fromAddress: center.blockchain_contract_id,
      tokenId: item.token_id || sftService.computeTokenId(item.id),
      cantidad: Number(cantidad),
      recipientCommitment: sha256(referencia),
      signatureHash: sha256(`${referencia}|insumo:${item.id}|cantidad:${cantidad}`),
      operatorId: Number(operatorId || 0),
    });
    return { status: 'anchored', txId: r.txId };
  } catch (error) {
    return local(error);
  }
}

/**
 * Resume el estado de varias operaciones: anchored solo si todas lo están.
 */
function estadoConjunto(resultados) {
  if (!resultados.length) return null;
  if (resultados.every((r) => r.status === 'disabled')) return 'disabled';
  return resultados.every((r) => r.status === 'anchored') ? 'anchored' : 'local';
}

module.exports = { desplegarCentro, mintearIngreso, quemarSalida, estadoConjunto, centerGeoHash };
