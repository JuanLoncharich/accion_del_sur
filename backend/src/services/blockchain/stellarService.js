/**
 * stellarService.js — Conexión con Stellar (Soroban RPC) y operaciones de bajo nivel.
 *
 * Contratos (ver contracts/README.md):
 *   - contrato_sft:      inventario como tokens semi-fungibles (lo usa sftService.js)
 *   - contrato_entregas: anclaje de recepciones de donaciones (hash del detalle + firma)
 *   - contrato_centro:   una instancia por centro; su dirección guarda los saldos SFT
 *
 * Patrón de transacciones:
 *   simulateTransaction → prepareTransaction → sendTransaction → polling
 */

const StellarSdk = require('@stellar/stellar-sdk');
const crypto = require('crypto');

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
      console.log(`[Stellar]    Entregas: ${this.entregasContractId || 'no configurado'}`);
      console.log(`[Stellar]    WASM de centro: ${this.centroWasmHash || 'no configurado'}`);
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

  // ─── Contrato Entregas: anclaje de recepciones ───────────────────────────

  async anchorDonationReception({
    receptionId, donorEmailHash, anchorHash, signatureHash,
    operatorId, itemId = 1, totalAcceptedQuantity = 0,
    centerLat = -34.6037, centerLng = -58.3816,
  }) {
    const contractId = this.entregasContractId;
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
    const contractId = this.entregasContractId;
    if (!this.isEnabled || !contractId) {
      return { verified: false, reason: 'Blockchain no habilitada' };
    }

    const args = [
      StellarSdk.nativeToScVal(Number(receptionId), { type: 'u64' }),
      this._hexToBytesScVal(signatureHash),
      this._hexToBytesScVal(anchorHash),
    ];

    const result = await this._invocarContrato(contractId, 'verificar_hashes', args, { readOnly: true });
    return { verified: result.returnValue === true };
  }

  // ─── Despliegue de contratos ─────────────────────────────────────────────

  async _enviarOperacion(operation, etiqueta) {
    const account = await this.rpc.getAccount(this.keypair.publicKey());
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.passphrase,
    })
      .setTimeout(60)
      .addOperation(operation)
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulación ${etiqueta} falló: ${sim.error}`);
    }

    const prepared = await this.rpc.prepareTransaction(tx);
    prepared.sign(this.keypair);

    const response = await this.rpc.sendTransaction(prepared);
    if (response.status === 'ERROR') {
      throw new Error(`${etiqueta} rechazado: ${JSON.stringify(response.errorResult)}`);
    }
    const result = await this._pollTransaccion(response.hash);
    return { result, txId: response.hash };
  }

  /** Sube un WASM a la red y devuelve su hash (hex). Es idempotente: el hash depende del contenido. */
  async uploadWasm(wasm) {
    this._assertKeypair();
    const { result, txId } = await this._enviarOperacion(StellarSdk.Operation.uploadContractWasm({ wasm }), 'upload WASM');
    const wasmHash = Buffer.from(StellarSdk.scValToNative(result.returnValue)).toString('hex');
    return { wasmHash, txId };
  }

  /** Crea una instancia de contrato a partir de un WASM subido. */
  async deployContract(wasmHash, constructorArgs = []) {
    this._assertKeypair();
    const operation = StellarSdk.Operation.createCustomContract({
      address: new StellarSdk.Address(this.keypair.publicKey()),
      wasmHash: Buffer.from(wasmHash, 'hex'),
      salt: crypto.randomBytes(32),
      ...(constructorArgs.length ? { constructorArgs } : {}),
    });
    const { result, txId } = await this._enviarOperacion(operation, 'deploy');
    return { contractId: StellarSdk.Address.fromScVal(result.returnValue).toString(), txId };
  }

  _assertKeypair() {
    if (!this.isEnabled || !this.keypair) {
      throw new Error('Stellar no habilitado o STELLAR_SECRET_KEY no configurada');
    }
  }

  // ─── Contrato Centro: una instancia por centro ───────────────────────────

  /**
   * Despliega una instancia de contrato_centro a partir del WASM ya subido (CENTRO_WASM_HASH).
   * El constructor recibe los datos del centro, así que despliegue e inicialización son atómicos.
   */
  async deployCenterContract({ nombre, lat_e6 = 0, lng_e6 = 0, geo_hash }) {
    if (!this.centroWasmHash) {
      throw new Error('CENTRO_WASM_HASH no configurado (correr npm run stellar:desplegar).');
    }
    const geoHashHex = geo_hash || crypto.createHash('sha256').update(`${nombre}|${lat_e6}|${lng_e6}`).digest('hex');
    const { contractId, txId } = await this.deployContract(this.centroWasmHash, [
      StellarSdk.nativeToScVal(nombre, { type: 'string' }),
      StellarSdk.nativeToScVal(lat_e6, { type: 'i64' }),
      StellarSdk.nativeToScVal(lng_e6, { type: 'i64' }),
      this._hexToBytesScVal(geoHashHex),
    ]);
    console.log(`[Stellar] Centro "${nombre}" desplegado. Contract ID: ${contractId}`);
    return { contractId, txId };
  }

  async obtenerInfoCentro(contractId) {
    if (!this.isEnabled || !this.keypair) return null;
    const result = await this._invocarContrato(contractId, 'obtener_info', [], { readOnly: true });
    return result.returnValue || null;
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
    const pollIntervalMs = Number(process.env.STELLAR_POLL_INTERVAL_MS || 1500);
    const timeoutSec = Number(process.env.STELLAR_TX_TIMEOUT_SEC || 120);
    const maxIntentos = Math.max(1, Math.ceil((timeoutSec * 1000) / Math.max(250, pollIntervalMs)));
    for (let i = 0; i < maxIntentos; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      let resultado;
      try {
        resultado = await this.rpc.getTransaction(txId);
      } catch (error) {
        // Errores de red/transitorios del RPC: continuar reintentando hasta timeout.
        if (i === maxIntentos - 1) {
          throw new Error(`Error consultando estado de transacción: ${error.message || error}`);
        }
        continue;
      }

      if (resultado.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
        return resultado;
      }
      if (resultado.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transacción fallida: ${txId}`);
      }
    }
    throw new Error(`Timeout esperando transacción: ${txId} (${timeoutSec}s)`);
  }
}

module.exports = new StellarService();
