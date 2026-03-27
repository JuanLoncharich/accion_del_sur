/**
 * sftService.js — Integración con el contrato SFT (Semi-Fungible Token)
 *
 * Un token por tipo de ítem (token_id = SHA256(item_id)).
 * Los centros acumulan balance mediante múltiples mints.
 * Las transferencias mueven balance entre centros.
 * El burn reduce el supply al entregar a un beneficiario.
 *
 * Si STELLAR_ENABLED=false → todas las operaciones lanzarán error.
 * El sistema es blockchain-first: MySQL solo se escribe si blockchain confirma.
 */

const StellarSdk = require('@stellar/stellar-sdk');
const crypto = require('crypto');
const stellarService = require('./stellarService');

class SftService {
  constructor() {
    this.sftContractId = process.env.SOROBAN_CONTRACT_SFT || null;
  }

  get isEnabled() {
    return stellarService.isEnabled && Boolean(this.sftContractId);
  }

  // ─── Helpers de conversión ──────────────────────────────────────────────────

  /**
   * Calcula el token_id como SHA256 del item_id serializado en 8 bytes big-endian.
   * Es determinista: siempre produce el mismo resultado para el mismo item_id.
   */
  computeTokenId(itemId) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(itemId));
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Calcula el SHA256 de los atributos JSON del ítem, ordenados alfabéticamente.
   * Produce un hash reproducible independientemente del orden de las claves.
   */
  computeAttributesHash(attributes) {
    if (!attributes || Object.keys(attributes).length === 0) {
      return '0'.repeat(64);
    }
    const sorted = Object.keys(attributes).sort().reduce((acc, k) => {
      acc[k] = attributes[k];
      return acc;
    }, {});
    return crypto.createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
  }

  _addressToScVal(address) {
    return new StellarSdk.Address(address).toScVal();
  }

  _hexToBytesScVal(hexValue) {
    const normalized = (hexValue || '').toString().trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new Error(`Hash hex inválido (esperado 64 chars): "${normalized.slice(0, 20)}..."`);
    }
    return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(normalized, 'hex'));
  }

  /**
   * Codifica TokenMetadata como ScvMap con claves Symbol ordenadas alfabéticamente.
   * Debe coincidir exactamente con el struct Rust:
   *   attributes_hash: BytesN<32>
   *   categoria: String
   *   item_id: u64
   *   nombre: String
   */
  _metadataToScVal(metadata) {
    const attrsHash = metadata.attributes_hash || '0'.repeat(64);

    // Orden alfabético obligatorio para que el XDR coincida con el struct Rust
    const entries = [
      {
        key: StellarSdk.xdr.ScVal.scvSymbol('attributes_hash'),
        val: StellarSdk.xdr.ScVal.scvBytes(Buffer.from(attrsHash, 'hex')),
      },
      {
        key: StellarSdk.xdr.ScVal.scvSymbol('categoria'),
        val: StellarSdk.xdr.ScVal.scvString(metadata.categoria || ''),
      },
      {
        key: StellarSdk.xdr.ScVal.scvSymbol('item_id'),
        val: StellarSdk.nativeToScVal(BigInt(metadata.item_id || 0), { type: 'u64' }),
      },
      {
        key: StellarSdk.xdr.ScVal.scvSymbol('nombre'),
        val: StellarSdk.xdr.ScVal.scvString(metadata.nombre || ''),
      },
    ];

    return StellarSdk.xdr.ScVal.scvMap(
      entries.map(({ key, val }) => new StellarSdk.xdr.ScMapEntry({ key, val }))
    );
  }

  _assertEnabled() {
    if (!stellarService.isEnabled) {
      throw new Error('[SFT] STELLAR_ENABLED no está activado');
    }
    if (!this.sftContractId) {
      throw new Error('[SFT] SOROBAN_CONTRACT_SFT no configurado en variables de entorno');
    }
  }

  // ─── Operaciones principales ────────────────────────────────────────────────

  /**
   * Mintea `cantidad` tokens del ítem al centro receptor.
   * Se llama cada vez que se finaliza una recepción de donación.
   * Múltiples mints del mismo token_id se acumulan en el balance del centro.
   *
   * @param {string} toCenterAddress  - blockchain_contract_id del centro receptor
   * @param {string} tokenId          - hex de 64 chars (resultado de computeTokenId)
   * @param {object} metadata         - { item_id, categoria, nombre, attributes_hash }
   * @param {number} cantidad         - unidades aceptadas
   * @param {string} firmaHash        - hash de la firma del operador (hex 64 chars, '00...0' si no hay)
   */
  async mintToCenter({ toCenterAddress, tokenId, metadata, cantidad, firmaHash }) {
    this._assertEnabled();

    const args = [
      this._addressToScVal(toCenterAddress),
      this._hexToBytesScVal(tokenId),
      this._metadataToScVal(metadata),
      StellarSdk.nativeToScVal(cantidad, { type: 'u64' }),
      this._hexToBytesScVal(firmaHash || '0'.repeat(64)),
    ];

    const result = await stellarService._invocarContrato(this.sftContractId, 'mint', args);
    console.log(`[SFT] mint → token=${tokenId.slice(0, 8)}... centro=${toCenterAddress.slice(0, 12)}... qty=${cantidad} tx=${result.txId}`);
    return { hash: result.hash, txId: result.txId };
  }

  /**
   * Transfiere tokens de un centro a otro.
   * Se llama al ejecutar una transferencia entre centros de distribución.
   *
   * @param {string} fromAddress  - blockchain_contract_id del centro origen
   * @param {string} toAddress    - blockchain_contract_id del centro destino
   * @param {string} tokenId      - hex 64 chars
   * @param {number} cantidad
   * @param {string} motivoHash   - SHA256 del motivo de la transferencia (hex 64 chars)
   */
  async transferBetweenCenters({ fromAddress, toAddress, tokenId, cantidad, motivoHash }) {
    this._assertEnabled();

    const args = [
      this._addressToScVal(fromAddress),
      this._addressToScVal(toAddress),
      this._hexToBytesScVal(tokenId),
      StellarSdk.nativeToScVal(cantidad, { type: 'u64' }),
      this._hexToBytesScVal(motivoHash || '0'.repeat(64)),
    ];

    const result = await stellarService._invocarContrato(this.sftContractId, 'transfer', args);
    console.log(`[SFT] transfer → token=${tokenId.slice(0, 8)}... de=${fromAddress.slice(0, 12)}... a=${toAddress.slice(0, 12)}... qty=${cantidad} tx=${result.txId}`);
    return { hash: result.hash, txId: result.txId };
  }

  /**
   * Destruye tokens al entregar al beneficiario final.
   * Reduce el balance del centro y el supply total del token.
   *
   * @param {string} fromAddress          - blockchain_contract_id del centro que entrega
   * @param {string} tokenId              - hex 64 chars
   * @param {number} cantidad
   * @param {string} recipientCommitment  - hash del identificador del beneficiario (hex 64 chars)
   * @param {string} signatureHash        - hash de la firma del beneficiario (hex 64 chars)
   * @param {number} operatorId           - user.id del operador que registra la entrega
   */
  async burnForDistribution({ fromAddress, tokenId, cantidad, recipientCommitment, signatureHash, operatorId }) {
    this._assertEnabled();

    const args = [
      this._addressToScVal(fromAddress),
      this._hexToBytesScVal(tokenId),
      StellarSdk.nativeToScVal(cantidad, { type: 'u64' }),
      this._hexToBytesScVal(recipientCommitment),
      this._hexToBytesScVal(signatureHash),
      StellarSdk.nativeToScVal(Number(operatorId), { type: 'u64' }),
    ];

    const result = await stellarService._invocarContrato(this.sftContractId, 'burn', args);
    console.log(`[SFT] burn → token=${tokenId.slice(0, 8)}... centro=${fromAddress.slice(0, 12)}... qty=${cantidad} tx=${result.txId}`);
    return { hash: result.hash, txId: result.txId };
  }

  // ─── Consultas ──────────────────────────────────────────────────────────────

  /**
   * Retorna el balance de un centro para un tipo de ítem (por item_id).
   */
  async getBalance(centerContractId, itemId) {
    if (!this.isEnabled) return 0;
    const tokenId = this.computeTokenId(itemId);
    const args = [
      this._addressToScVal(centerContractId),
      this._hexToBytesScVal(tokenId),
    ];
    const result = await stellarService._invocarContrato(this.sftContractId, 'balance_of', args, { readOnly: true });
    try {
      return Number(StellarSdk.scValToNative(result.returnValue) || 0);
    } catch {
      return Number(result.returnValue || 0);
    }
  }

  /**
   * Retorna el total supply para un token (por item_id).
   */
  async getTotalSupply(itemId) {
    if (!this.isEnabled) return 0;
    const tokenId = this.computeTokenId(itemId);
    const args = [this._hexToBytesScVal(tokenId)];
    const result = await stellarService._invocarContrato(this.sftContractId, 'total_supply', args, { readOnly: true });
    try {
      return Number(StellarSdk.scValToNative(result.returnValue) || 0);
    } catch {
      return Number(result.returnValue || 0);
    }
  }

  /**
   * Retorna los token_ids (como hex strings) que tiene un centro en inventario.
   */
  async getCenterInventory(centerContractId) {
    if (!this.isEnabled) return [];
    const args = [this._addressToScVal(centerContractId)];
    const result = await stellarService._invocarContrato(this.sftContractId, 'get_inventory', args, { readOnly: true });
    try {
      const native = StellarSdk.scValToNative(result.returnValue);
      if (!Array.isArray(native)) return [];
      return native.map(v => (Buffer.isBuffer(v) ? v.toString('hex') : String(v)));
    } catch {
      return [];
    }
  }

  /**
   * Retorna la trazabilidad completa de un ítem consultando eventos del contrato SFT.
   * Útil para el frontend de trackeo blockchain.
   */
  async getTokenTrace(itemId, startLedger = null) {
    if (!this.isEnabled) return [];
    const tokenId = this.computeTokenId(itemId);

    let desiredStart = Number(startLedger || 0);
    if (!desiredStart) {
      try {
        const latest = await stellarService.rpc.getLatestLedger();
        desiredStart = Math.max(1, Number(latest?.sequence || 1) - 5000);
      } catch {
        desiredStart = 1;
      }
    }

    const fetchEvents = async (effectiveStartLedger) => {
      return stellarService.rpc.getEvents({
        startLedger: effectiveStartLedger,
        filters: [{
          type: 'contract',
          contractIds: [this.sftContractId],
        }],
        pagination: { limit: 200 },
      });
    };

    try {
      let response;
      try {
        response = await fetchEvents(desiredStart);
      } catch (rangeErr) {
        const msg = String(rangeErr?.message || '');
        const match = msg.match(/ledger range:\s*(\d+)\s*-\s*(\d+)/i);
        if (!match) throw rangeErr;
        const minLedger = Number(match[1]);
        const maxLedger = Number(match[2]);
        const recoveredStart = Math.max(minLedger, maxLedger - 5000);
        response = await fetchEvents(recoveredStart);
      }

      const tokenBuf = Buffer.from(tokenId, 'hex');
      const events = (response.events || []).filter(evt => {
        try {
          // El topic[1] es el token_id (BytesN<32>)
          const topicBytes = StellarSdk.scValToNative(evt.topic[1]);
          const topicBuf = Buffer.isBuffer(topicBytes)
            ? topicBytes
            : (topicBytes instanceof Uint8Array ? Buffer.from(topicBytes) : null);
          return Boolean(topicBuf) && topicBuf.equals(tokenBuf);
        } catch {
          return false;
        }
      });

      return events.map(evt => {
        let tipo = 'unknown';
        try {
          tipo = StellarSdk.scValToNative(evt.topic[0]);
        } catch {}

        let data = null;
        try {
          data = StellarSdk.scValToNative(evt.value);
        } catch {}

        return {
          tipo,
          token_id: tokenId,
          tx_id: evt.txHash,
          ledger: evt.ledger,
          timestamp: evt.ledgerClosedAt,
          data,
        };
      });
    } catch (e) {
      console.error('[SFT] Error consultando eventos:', e.message);
      return [];
    }
  }
}

module.exports = new SftService();
