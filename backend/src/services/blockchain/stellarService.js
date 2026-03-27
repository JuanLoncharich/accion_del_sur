/**
 * stellarService.js — Integración real con Stellar Testnet + Contrato Soroban
 *
 * Activa cuando STELLAR_ENABLED=true en .env.
 * Requiere: STELLAR_SECRET_KEY, SOROBAN_CONTRACT_ID configurados.
 *
 * Patrón de transacciones (según guía vendimia-tech):
 *   simulateTransaction → prepareTransaction → sendTransaction → polling
 */

const StellarSdk = require('@stellar/stellar-sdk');

const NETWORKS = {
  testnet: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

class StellarService {
  constructor() {
    this.networkName = process.env.STELLAR_NETWORK || 'testnet';
    this.isEnabled = process.env.STELLAR_ENABLED === 'true';
    this.contractId = process.env.SOROBAN_CONTRACT_ID || null;

    if (this.isEnabled) {
      this._init();
    }
  }

  _init() {
    const net = NETWORKS[this.networkName];
    if (!net) throw new Error(`[Stellar] Red desconocida: ${this.networkName}`);

    this.rpc = new StellarSdk.rpc.Server(net.rpcUrl);
    this.horizon = new StellarSdk.Horizon.Server(net.horizonUrl);
    this.passphrase = net.passphrase;

    if (!process.env.STELLAR_SECRET_KEY) {
      console.warn('[Stellar] ⚠️  STELLAR_SECRET_KEY no configurada. Modo simulación activo.');
      this.keypair = null;
    } else {
      this.keypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY);
      console.log(`[Stellar] ✅ Servicio inicializado en ${this.networkName}`);
      console.log(`[Stellar]    Cuenta: ${this.keypair.publicKey()}`);
    }
  }

  // ─── Métodos públicos ──────────────────────────────────────────────────────

  _hexToBytesScVal(hexValue) {
    const normalized = (hexValue || '').toString().trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      throw new Error('Se esperaba hash hexadecimal SHA-256 de 64 caracteres');
    }
    return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(normalized, 'hex'));
  }

  _scaleCoordinate(value) {
    return Math.round(Number(value || 0) * 1_000_000);
  }

  /**
   * Mintea un token de trazabilidad para un ítem de donación.
   * Llama a mint_token_donacion() del contrato Soroban.
   *
   * @param {Object} params
   * @param {Object} params.item     — Objeto Item de Sequelize
   * @param {Object} params.donation — Objeto Donation de Sequelize
   * @returns {{ hash, txId, status }} o { hash: null, status: 'pending' } si no está habilitado
   */
  async mintDonationToken({
    item,
    donation,
    center_latitude,
    center_longitude,
    center_geo_hash,
  }) {
    if (!this.isEnabled) {
      console.log(`[Stellar] mintDonationToken deshabilitado → item_id=${item.id}`);
      return { hash: null, txId: null, status: 'pending' };
    }

    if (!this.contractId) {
      console.warn('[Stellar] SOROBAN_CONTRACT_ID no configurado');
      return { hash: null, txId: null, status: 'pending' };
    }

    try {
      // nativeToScVal con objeto genera scvMap con claves Symbol automáticamente
      const metadataScVal = StellarSdk.nativeToScVal(
        { categoria: item.category?.name || 'desconocida', nombre: item.name || '' },
        { type: 'map' }
      );

      const args = [
        StellarSdk.nativeToScVal(item.id, { type: 'u64' }),
        metadataScVal,
        StellarSdk.nativeToScVal(donation.quantity, { type: 'u64' }),
        StellarSdk.nativeToScVal(this._scaleCoordinate(center_latitude), { type: 'i64' }),
        StellarSdk.nativeToScVal(this._scaleCoordinate(center_longitude), { type: 'i64' }),
        this._hexToBytesScVal(center_geo_hash),
      ];

      const result = await this._invocarContrato('mint_token_donacion', args);

      console.log(`[Stellar] ✅ Token minteado → item_id=${item.id} hash=${result.hash}`);
      return { hash: result.hash, txId: result.txId, status: 'minted' };
    } catch (error) {
      console.error(`[Stellar] ❌ Error en minteo → item_id=${item.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Registra una distribución en la blockchain.
   * Llama a registrar_distribucion() del contrato Soroban.
   *
   * @param {Object} params
   * @param {Object} params.distribution — Objeto Distribution de Sequelize
   * @param {Object} params.item         — Objeto Item de Sequelize
   * @returns {{ hash, txId }}
   */
  async recordDistribution({ distribution, item }) {
    if (!this.isEnabled) {
      console.log(`[Stellar] recordDistribution deshabilitado → distribution_id=${distribution.id}`);
      return { hash: null, txId: null, status: 'pending' };
    }

    if (!this.contractId) {
      console.warn('[Stellar] SOROBAN_CONTRACT_ID no configurado');
      return { hash: null, txId: null, status: 'pending' };
    }

    try {
      // receptor_hash ya viene como hex string de 64 chars → convertir a BytesN<32>
      const receptorHashBytes = Buffer.from(distribution.receiver_hash, 'hex');
      const receptorHashScVal = StellarSdk.xdr.ScVal.scvBytes(receptorHashBytes);

      const args = [
        StellarSdk.nativeToScVal(item.id, { type: 'u64' }),
        receptorHashScVal,
        StellarSdk.nativeToScVal(distribution.quantity, { type: 'u64' }),
      ];

      const result = await this._invocarContrato('registrar_distribucion', args);

      console.log(`[Stellar] ✅ Distribución registrada → dist_id=${distribution.id} hash=${result.hash}`);
      return { hash: result.hash, txId: result.txId };
    } catch (error) {
      console.error(`[Stellar] ❌ Error en distribución → dist_id=${distribution.id}:`, error.message);
      throw error;
    }
  }

  /**
   * Registra una entrega verificada con pruebas de integridad y operador.
   */
  async recordVerifiedDistribution({
    distribution_id,
    item_id,
    quantity,
    recipient_commitment,
    signature_hash,
    receipt_hash,
    operator_id,
    assurance_level,
    center_latitude,
    center_longitude,
  }) {
    if (!this.isEnabled) {
      console.log(`[Stellar] recordVerifiedDistribution deshabilitado → distribution_id=${distribution_id}`);
      return { hash: null, txId: null, status: 'pending' };
    }

    if (!this.contractId) {
      console.warn('[Stellar] SOROBAN_CONTRACT_ID no configurado');
      return { hash: null, txId: null, status: 'pending' };
    }

    const args = [
      StellarSdk.nativeToScVal(distribution_id, { type: 'u64' }),
      StellarSdk.nativeToScVal(item_id, { type: 'u64' }),
      StellarSdk.nativeToScVal(quantity, { type: 'u64' }),
      this._hexToBytesScVal(recipient_commitment),
      this._hexToBytesScVal(signature_hash),
      this._hexToBytesScVal(receipt_hash),
      StellarSdk.nativeToScVal(operator_id, { type: 'u64' }),
      StellarSdk.nativeToScVal(assurance_level || 'MANUAL_VERIFIED', { type: 'string' }),
      StellarSdk.nativeToScVal(this._scaleCoordinate(center_latitude), { type: 'i64' }),
      StellarSdk.nativeToScVal(this._scaleCoordinate(center_longitude), { type: 'i64' }),
    ];

    const result = await this._invocarContrato('registrar_entrega_verificada', args);
    return { hash: result.hash, txId: result.txId, status: 'anchored' };
  }

  async getVerifiedDistribution(distributionId) {
    if (!this.isEnabled || !this.contractId) return null;

    const args = [StellarSdk.nativeToScVal(distributionId, { type: 'u64' })];
    const result = await this._invocarContrato('obtener_entrega', args, { readOnly: true });
    return result.returnValue || null;
  }

  async verifyDeliveryHashes(distributionId, signatureHash, receiptHash) {
    if (!this.isEnabled || !this.contractId) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }

    const args = [
      StellarSdk.nativeToScVal(distributionId, { type: 'u64' }),
      this._hexToBytesScVal(signatureHash),
      this._hexToBytesScVal(receiptHash),
    ];

    const result = await this._invocarContrato('verificar_hashes', args, { readOnly: true });
    return { verified: result.returnValue === true };
  }

  /**
   * Verifica si un ítem tiene token registrado en el contrato.
   *
   * @param {number} itemId
   * @returns {{ verified: boolean, reason?: string }}
   */
  async verifyToken(itemId) {
    if (!this.isEnabled || !this.contractId) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }

    try {
      const args = [StellarSdk.nativeToScVal(itemId, { type: 'u64' })];
      const result = await this._invocarContrato('verificar_token', args, { readOnly: true });
      return { verified: result.returnValue === true };
    } catch (error) {
      console.error('[Stellar] Error verificando token:', error.message);
      return { verified: false, reason: error.message };
    }
  }

  // ─── Core: invocar contrato ────────────────────────────────────────────────

  /**
   * Patrón completo según vendimia-tech guide:
   * build → simulate → prepare → sign → send → poll
   */
  async _invocarContrato(metodo, args, { readOnly = false } = {}) {
    if (!this.keypair) throw new Error('Keypair no configurado');

    const account = await this.rpc.getAccount(this.keypair.publicKey());

    const contrato = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.passphrase,
    })
      .addOperation(contrato.call(metodo, ...args))
      .setTimeout(30)
      .build();

    // 1. Simular primero (detecta errores antes de gastar fees)
    const sim = await this.rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulación falló: ${sim.error}`);
    }

    if (readOnly) {
      // Para lectura, el valor de retorno está en la simulación
      const returnValue = StellarSdk.scValToNative(sim.result?.retval);
      return { returnValue };
    }

    // 2. Preparar (agrega auth entries y recursos de fee)
    const txPreparada = await this.rpc.prepareTransaction(tx);

    // 3. Firmar
    txPreparada.sign(this.keypair);

    // 4. Enviar
    const response = await this.rpc.sendTransaction(txPreparada);

    if (response.status === 'ERROR') {
      throw new Error(`Transacción rechazada: ${JSON.stringify(response.errorResult)}`);
    }

    // 5. Polling hasta confirmación
    const txId = response.hash;
    const resultado = await this._pollTransaccion(txId);

    // Extraer valor de retorno (el hash del contrato)
    let hash = txId; // fallback: usar el tx hash
    if (resultado.returnValue) {
      try {
        const retNativo = StellarSdk.scValToNative(resultado.returnValue);
        if (Buffer.isBuffer(retNativo)) {
          hash = retNativo.toString('hex');
        }
      } catch {
        // si no se puede parsear, usamos txId
      }
    }

    return { hash, txId };
  }

  /**
   * Polling hasta que la transacción se confirme o falle.
   * Máximo 30 intentos con 1 segundo de intervalo.
   */
  async _pollTransaccion(txId) {
    const MAX_INTENTOS = 30;
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const resultado = await this.rpc.getTransaction(txId);

      if (resultado.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        return resultado;
      }
      if (resultado.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transacción fallida: ${txId}`);
      }
      // NOT_FOUND = todavía pendiente, seguir esperando
    }
    throw new Error(`Timeout esperando transacción: ${txId}`);
  }

}

module.exports = new StellarService();
