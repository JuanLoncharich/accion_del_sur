/**
 * stellarService.js — Integración con Stellar Testnet + Contratos Soroban
 *
 * Soporta múltiples contratos:
 *   - contrato_donaciones: minteo de tokens
 *   - contrato_entregas: entrega final a destinatarios
 *   - contrato_centro: N instancias (una por centro de distribución)
 *
 * Patrón de transacciones:
 *   simulateTransaction → prepareTransaction → sendTransaction → polling
 */

const StellarSdk = require('@stellar/stellar-sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

    // Contract IDs
    this.donacionesContractId = process.env.SOROBAN_CONTRACT_DONACIONES || process.env.SOROBAN_CONTRACT_ID || null;
    this.entregasContractId = process.env.SOROBAN_CONTRACT_ENTREGAS || null;
    this.centroWasmHash = process.env.CENTRO_WASM_HASH || null;

    if (this.isEnabled) {
      this._init();
    }
  }

  _init() {
    const net = NETWORKS[this.networkName];
    if (!net) throw new Error(`[Stellar] Red desconocida: ${this.networkName}`);

    const rpcUrl = process.env.STELLAR_RPC_URL || net.rpcUrl;
    const rpcOptions = {};
    const rpcProtocol = new URL(rpcUrl).protocol.toLowerCase();
    if (rpcProtocol === 'http:') {
      rpcOptions.allowHttp = true;
      console.warn('[Stellar] Usando Soroban RPC por HTTP inseguro (modo desarrollo).');
    }

    this.rpc = new StellarSdk.rpc.Server(rpcUrl, rpcOptions);
    this.horizon = new StellarSdk.Horizon.Server(net.horizonUrl);
    this.passphrase = net.passphrase;

    if (!process.env.STELLAR_SECRET_KEY) {
      console.warn('[Stellar] STELLAR_SECRET_KEY no configurada.');
      this.keypair = null;
    } else {
      this.keypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY);
      console.log(`[Stellar] Servicio inicializado en ${this.networkName}`);
      console.log(`[Stellar]    Cuenta: ${this.keypair.publicKey()}`);
      console.log(`[Stellar]    SFT: ${process.env.SOROBAN_CONTRACT_SFT || 'no configurado'}`);
      console.log(`[Stellar]    Donaciones (legacy): ${this.donacionesContractId || 'no configurado'}`);
      console.log(`[Stellar]    Entregas (legacy): ${this.entregasContractId || 'no configurado'}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  // ─── Contrato Donaciones ─────────────────────────────────────────────────

  async mintDonationToken({ item, donation, center_latitude, center_longitude, center_geo_hash }) {
    if (!this.isEnabled || !this.donacionesContractId) {
      return { hash: null, txId: null, status: 'pending' };
    }

    try {
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

      const result = await this._invocarContrato(this.donacionesContractId, 'mint_token_donacion', args);
      console.log(`[Stellar] Token minteado → item_id=${item.id} hash=${result.hash}`);
      return { hash: result.hash, txId: result.txId, status: 'minted' };
    } catch (error) {
      console.error(`[Stellar] Error en minteo → item_id=${item.id}:`, error.message);
      throw error;
    }
  }

  async verifyToken(itemId) {
    if (!this.isEnabled || !this.donacionesContractId) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }
    try {
      const args = [StellarSdk.nativeToScVal(itemId, { type: 'u64' })];
      const result = await this._invocarContrato(this.donacionesContractId, 'verificar_token', args, { readOnly: true });
      return { verified: result.returnValue === true };
    } catch (error) {
      return { verified: false, reason: error.message };
    }
  }

  // ─── Contrato Entregas ───────────────────────────────────────────────────

  async recordVerifiedDistribution({
    distribution_id, item_id, quantity,
    recipient_commitment, signature_hash, receipt_hash,
    operator_id, assurance_level, center_latitude, center_longitude,
  }) {
    const contractId = this.entregasContractId || this.donacionesContractId;
    if (!this.isEnabled || !contractId) {
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

    const result = await this._invocarContrato(contractId, 'registrar_entrega_verificada', args);
    return { hash: result.hash, txId: result.txId, status: 'anchored' };
  }

  async getVerifiedDistribution(distributionId) {
    const contractId = this.entregasContractId || this.donacionesContractId;
    if (!this.isEnabled || !contractId) return null;

    const args = [StellarSdk.nativeToScVal(distributionId, { type: 'u64' })];
    const result = await this._invocarContrato(contractId, 'obtener_entrega', args, { readOnly: true });
    return result.returnValue || null;
  }

  async verifyDeliveryHashes(distributionId, signatureHash, receiptHash) {
    const contractId = this.entregasContractId || this.donacionesContractId;
    if (!this.isEnabled || !contractId) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }

    const args = [
      StellarSdk.nativeToScVal(distributionId, { type: 'u64' }),
      this._hexToBytesScVal(signatureHash),
      this._hexToBytesScVal(receiptHash),
    ];

    const result = await this._invocarContrato(contractId, 'verificar_hashes', args, { readOnly: true });
    return { verified: result.returnValue === true };
  }

  // ─── Donation Reception Anchor (reusa contrato_entregas) ─────────────────

  async anchorDonationReception({
    receptionId, donorEmailHash, anchorHash, signatureHash,
    operatorId, itemId = 1, totalAcceptedQuantity = 0,
    centerLat = -34.6037, centerLng = -58.3816,
  }) {
    const contractId = this.entregasContractId || this.donacionesContractId;
    if (!this.isEnabled || !contractId) {
      return { hash: null, txId: null, status: 'pending' };
    }

    const args = [
      StellarSdk.nativeToScVal(Number(receptionId), { type: 'u64' }),
      StellarSdk.nativeToScVal(Number(itemId), { type: 'u64' }),
      StellarSdk.nativeToScVal(Number(totalAcceptedQuantity), { type: 'u64' }),
      this._hexToBytesScVal(donorEmailHash),
      this._hexToBytesScVal(signatureHash),
      this._hexToBytesScVal(anchorHash),
      StellarSdk.nativeToScVal(Number(operatorId), { type: 'u64' }),
      StellarSdk.nativeToScVal('DONATION_RECEPTION', { type: 'string' }),
      StellarSdk.nativeToScVal(this._scaleCoordinate(centerLat), { type: 'i64' }),
      StellarSdk.nativeToScVal(this._scaleCoordinate(centerLng), { type: 'i64' }),
    ];

    const result = await this._invocarContrato(contractId, 'registrar_entrega_verificada', args);
    return { hash: result.hash, txId: result.txId, status: 'anchored' };
  }

  async verifyDonationReceptionAnchor({ receptionId, signatureHash, anchorHash }) {
    if (!this.isEnabled) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }
    return this.verifyDeliveryHashes(receptionId, signatureHash, anchorHash);
  }

  // ─── Contrato Centro — Deploy + Operaciones ─────────────────────────────

  async uploadCentroWasm(wasmPath) {
    if (!this.isEnabled || !this.keypair) {
      throw new Error('Stellar no habilitado o keypair no configurado');
    }

    const wasm = fs.readFileSync(wasmPath);
    console.log(`[Stellar] Subiendo WASM de centro: ${wasm.length} bytes`);

    const account = await this.rpc.getAccount(this.keypair.publicKey());

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: this.passphrase,
    })
      .setTimeout(30)
      .addOperation(StellarSdk.Operation.uploadContractWasm({ wasm }))
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulación upload WASM falló: ${sim.error}`);
    }

    const prepared = await this.rpc.prepareTransaction(tx);
    prepared.sign(this.keypair);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`Upload WASM rechazado: ${JSON.stringify(response.errorResult)}`);
    }

    const result = await this._pollTransaccion(response.hash);

    // Extract WASM hash from result
    let wasmHash;
    if (result.returnValue) {
      try {
        const native = StellarSdk.scValToNative(result.returnValue);
        if (Buffer.isBuffer(native)) {
          wasmHash = native.toString('hex');
        }
      } catch {}
    }

    if (!wasmHash) {
      // Compute hash locally as fallback
      wasmHash = crypto.createHash('sha256').update(wasm).digest('hex');
    }

    this.centroWasmHash = wasmHash;
    console.log(`[Stellar] WASM de centro subido. Hash: ${wasmHash}`);
    return { wasmHash, txId: response.hash };
  }

  async deployCenterContract() {
    if (!this.isEnabled || !this.keypair) {
      throw new Error('Stellar no habilitado o keypair no configurado');
    }

    if (!this.centroWasmHash) {
      throw new Error('CENTRO_WASM_HASH no configurado. Subir WASM primero.');
    }

    const salt = crypto.randomBytes(32);
    const wasmHashBuffer = Buffer.from(this.centroWasmHash, 'hex');

    const account = await this.rpc.getAccount(this.keypair.publicKey());

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: this.passphrase,
    })
      .setTimeout(30)
      .addOperation(StellarSdk.Operation.createCustomContract({
        address: new StellarSdk.Address(this.keypair.publicKey()),
        wasmHash: wasmHashBuffer,
        salt,
      }))
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulación deploy centro falló: ${sim.error}`);
    }

    const prepared = await this.rpc.prepareTransaction(tx);
    prepared.sign(this.keypair);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`Deploy centro rechazado: ${JSON.stringify(response.errorResult)}`);
    }

    const result = await this._pollTransaccion(response.hash);

    // Extract contract ID from the result
    let contractId = null;
    if (result.returnValue) {
      try {
        const native = StellarSdk.scValToNative(result.returnValue);
        if (typeof native === 'string') {
          contractId = native;
        } else if (Buffer.isBuffer(native)) {
          contractId = StellarSdk.StrKey.encodeContract(native);
        }
      } catch {}
    }

    // Fallback: compute contract ID from address hash preimage
    if (!contractId) {
      try {
        const preimage = StellarSdk.xdr.HashIdPreimage.envelopeTypeContractId(
          new StellarSdk.xdr.HashIdPreimageContractId({
            networkId: Buffer.from(
              crypto.createHash('sha256').update(this.passphrase).digest()
            ),
            contractIdPreimage: StellarSdk.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
              new StellarSdk.xdr.ContractIdPreimageFromAddress({
                address: new StellarSdk.Address(this.keypair.publicKey()).toScAddress(),
                salt,
              })
            ),
          })
        );
        const contractIdHash = crypto.createHash('sha256').update(preimage.toXDR()).digest();
        contractId = StellarSdk.StrKey.encodeContract(contractIdHash);
      } catch (e) {
        console.error('[Stellar] Error computing contract ID:', e.message);
      }
    }

    console.log(`[Stellar] Centro deployado. Contract ID: ${contractId}`);
    return { contractId, txId: response.hash };
  }

  async initializeCenter(contractId, { nombre, lat_e6, lng_e6, geo_hash }) {
    if (!this.isEnabled || !this.keypair) {
      return { success: false, status: 'pending' };
    }

    const geoHashHex = geo_hash || crypto.createHash('sha256').update(`${nombre}|${lat_e6}|${lng_e6}`).digest('hex');

    const args = [
      StellarSdk.nativeToScVal(nombre, { type: 'string' }),
      StellarSdk.nativeToScVal(lat_e6, { type: 'i64' }),
      StellarSdk.nativeToScVal(lng_e6, { type: 'i64' }),
      this._hexToBytesScVal(geoHashHex),
    ];

    const result = await this._invocarContrato(contractId, 'inicializar', args);
    return { success: true, hash: result.hash, txId: result.txId };
  }

  async registrarIngresoCentro(contractId, { itemId, cantidad, origen, firmaHash, motivo }) {
    if (!this.isEnabled || !this.keypair) {
      return { hash: null, txId: null, status: 'pending' };
    }

    const firmaHex = firmaHash || '0'.repeat(64);

    const args = [
      StellarSdk.nativeToScVal(Number(itemId), { type: 'u64' }),
      StellarSdk.nativeToScVal(Number(cantidad), { type: 'u64' }),
      StellarSdk.nativeToScVal(origen || 'donacion', { type: 'string' }),
      this._hexToBytesScVal(firmaHex),
      StellarSdk.nativeToScVal(motivo || 'Ingreso', { type: 'string' }),
    ];

    const result = await this._invocarContrato(contractId, 'registrar_ingreso', args);
    return { hash: result.hash, txId: result.txId, status: 'anchored' };
  }

  async registrarEgresoCentro(contractId, { itemId, cantidad, destino, firmaHash, motivo }) {
    if (!this.isEnabled || !this.keypair) {
      return { hash: null, txId: null, status: 'pending' };
    }

    const firmaHex = firmaHash || '0'.repeat(64);

    const args = [
      StellarSdk.nativeToScVal(Number(itemId), { type: 'u64' }),
      StellarSdk.nativeToScVal(Number(cantidad), { type: 'u64' }),
      StellarSdk.nativeToScVal(destino || 'desconocido', { type: 'string' }),
      this._hexToBytesScVal(firmaHex),
      StellarSdk.nativeToScVal(motivo || 'Egreso', { type: 'string' }),
    ];

    const result = await this._invocarContrato(contractId, 'registrar_egreso', args);
    return { hash: result.hash, txId: result.txId, status: 'anchored' };
  }

  async obtenerInventarioCentro(contractId) {
    if (!this.isEnabled || !this.keypair) {
      return { items: [], status: 'pending' };
    }

    const result = await this._invocarContrato(contractId, 'obtener_inventario', [], { readOnly: true });
    return { items: result.returnValue || [], status: 'ok' };
  }

  async obtenerInfoCentro(contractId) {
    if (!this.isEnabled || !this.keypair) {
      return null;
    }

    const result = await this._invocarContrato(contractId, 'obtener_info', [], { readOnly: true });
    return result.returnValue || null;
  }

  async tieneItemCentro(contractId, itemId) {
    if (!this.isEnabled || !this.keypair) {
      return false;
    }

    const args = [StellarSdk.nativeToScVal(Number(itemId), { type: 'u64' })];
    const result = await this._invocarContrato(contractId, 'tiene_item', args, { readOnly: true });
    return result.returnValue === true;
  }

  // ─── Core: invocar contrato ──────────────────────────────────────────────

  async _invocarContrato(contractId, metodo, args, { readOnly = false } = {}) {
    if (!this.keypair) throw new Error('Keypair no configurado');
    if (!contractId) throw new Error(`Contract ID no proporcionado para método: ${metodo}`);

    const account = await this.rpc.getAccount(this.keypair.publicKey());

    const contrato = new StellarSdk.Contract(contractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.passphrase,
    })
      .addOperation(contrato.call(metodo, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulación falló [${metodo}]: ${sim.error}`);
    }

    if (readOnly) {
      const returnValue = StellarSdk.scValToNative(sim.result?.retval);
      return { returnValue };
    }

    const txPreparada = await this.rpc.prepareTransaction(tx);
    txPreparada.sign(this.keypair);

    const response = await this.rpc.sendTransaction(txPreparada);
    if (response.status === 'ERROR') {
      throw new Error(`Transacción rechazada [${metodo}]: ${JSON.stringify(response.errorResult)}`);
    }

    const txId = response.hash;
    const resultado = await this._pollTransaccion(txId);

    let hash = txId;
    if (resultado.returnValue) {
      try {
        const retNativo = StellarSdk.scValToNative(resultado.returnValue);
        if (Buffer.isBuffer(retNativo)) {
          hash = retNativo.toString('hex');
        }
      } catch {
        // fallback to txId
      }
    }

    return { hash, txId };
  }

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
    }
    throw new Error(`Timeout esperando transacción: ${txId}`);
  }
}

module.exports = new StellarService();
