#!/usr/bin/env node

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { sequelize } = require('../../src/models');
const stellarService = require('../../src/services/blockchain/stellarService');

const API_BASE = process.env.E2E_API_BASE || `http://localhost:${process.env.PORT || 3001}/api`;
const LOGIN_USER = process.env.E2E_USER || 'admin';
const LOGIN_PASS = process.env.E2E_PASS || 'admin123';

const onePixelSignature =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgLJrVN4AAAAASUVORK5CYII=';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requestJson = async (url, { method = 'GET', token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(data)}`);
  }

  return data;
};

const requestForm = async (url, { token, formData }) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status} ${JSON.stringify(data)}`);
  }

  return data;
};

const buildAttributesFromCategory = () => {
  // Emula un envío válido del front con atributos compactos para evitar nombres excesivos.
  return { e2e: 'x' };
};

(async () => {
  const summary = {
    donation: {},
    distribution: {},
    blockchain: {},
  };

  try {
    console.log(`E2E -> API base: ${API_BASE}`);

    const login = await requestJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: { username: LOGIN_USER, password: LOGIN_PASS },
    });
    assert(login.token, 'Login sin token');
    const token = login.token;
    console.log(`Login OK as ${login.user?.username}`);

    const categories = await requestJson(`${API_BASE}/categories`, { token });
    assert(Array.isArray(categories) && categories.length > 0, 'No hay categorias para donacion');

    const donationCategory = categories.find((c) => (c.attributes || []).length > 0) || categories[0];
    const attributes = buildAttributesFromCategory(donationCategory);

    const donationForm = new FormData();
    donationForm.append('category_id', String(donationCategory.id));
    donationForm.append('attributes', JSON.stringify(attributes));
    donationForm.append('quantity', '3');
    donationForm.append('notes', 'E2E donation flow');
    donationForm.append('center_name', 'Centro E2E');
    donationForm.append('center_latitude', '-34.603722');
    donationForm.append('center_longitude', '-58.381592');

    const donation = await requestForm(`${API_BASE}/donations`, {
      token,
      formData: donationForm,
    });

    assert(donation.id, 'Donacion no devolvio id');
    summary.donation.id = donation.id;
    summary.donation.item_id = donation.item_id;
    console.log(`Donacion OK id=${donation.id} item_id=${donation.item_id}`);

    const donationList = await requestJson(`${API_BASE}/donations?limit=20&page=1`, { token });
    const donationRow = donationList.data.find((d) => d.id === donation.id);
    assert(donationRow, 'No se encontro donacion en listado');
    assert(donationRow.center_name, 'center_name no persistido en donacion');
    assert(donationRow.center_latitude !== null, 'center_latitude no persistido en donacion');
    assert(donationRow.center_longitude !== null, 'center_longitude no persistido en donacion');
    assert(donationRow.center_geo_hash, 'center_geo_hash no persistido en donacion');
    assert(donationRow.blockchain_tx_id, 'donacion sin blockchain_tx_id');
    assert(donationRow.blockchain_hash, 'donacion sin blockchain_hash');

    const tokenCheck = await stellarService.verifyToken(donation.item_id);
    assert(tokenCheck.verified, `Token de donacion no verificado on-chain: ${tokenCheck.reason || 'sin motivo'}`);

    summary.blockchain.donation_token_verified = tokenCheck.verified;

    const items = await requestJson(`${API_BASE}/items?limit=50&page=1`, { token });
    const itemForDistribution = items.data.find((i) => i.id === donation.item_id && i.quantity > 0) ||
      items.data.find((i) => i.quantity > 0);
    assert(itemForDistribution, 'No hay item con stock para distribucion');

    const prepare = await requestJson(`${API_BASE}/distributions/prepare`, {
      method: 'POST',
      token,
      body: {
        item_id: itemForDistribution.id,
        quantity: 1,
        notes: 'E2E distribution flow',
        center_name: 'Centro E2E',
        center_latitude: -34.603722,
        center_longitude: -58.381592,
      },
    });

    const distributionId = prepare.id;
    assert(distributionId, 'prepare no devolvio id de distribucion');
    console.log(`Prepare OK distribution_id=${distributionId}`);

    await requestJson(`${API_BASE}/distributions/${distributionId}/identify-manual`, {
      method: 'POST',
      token,
      body: {
        receiver_identifier: '30111222',
        doc_type: 'DNI',
      },
    });
    console.log('Identify-manual OK');

    await requestJson(`${API_BASE}/distributions/${distributionId}/sign`, {
      method: 'POST',
      token,
      body: {
        signature_data: onePixelSignature,
        signature_mime: 'image/png',
      },
    });
    console.log('Sign OK');

    const finalize = await requestJson(`${API_BASE}/distributions/${distributionId}/finalize`, {
      method: 'POST',
      token,
    });

    assert(finalize.status === 'anchored', `Finalize no quedo anchored: ${finalize.status}`);
    assert(finalize.blockchain_tx_id, 'Finalize sin blockchain_tx_id');
    assert(finalize.blockchain_hash, 'Finalize sin blockchain_hash');

    summary.distribution.id = distributionId;
    summary.distribution.status = finalize.status;
    summary.distribution.blockchain_tx_id = finalize.blockchain_tx_id;

    const publicAudit = await requestJson(`${API_BASE}/audit/public/${distributionId}`);
    assert(publicAudit.integrity?.recipient_commitment, 'audit public sin recipient_commitment');
    assert(publicAudit.integrity?.signature_hash, 'audit public sin signature_hash');
    assert(publicAudit.integrity?.receipt_hash, 'audit public sin receipt_hash');
    assert(publicAudit.blockchain?.tx_id, 'audit public sin tx_id');
    assert(!('receiver_identifier' in publicAudit), 'audit public expone receiver_identifier');

    const internalAudit = await requestJson(
      `${API_BASE}/audit/internal/${distributionId}?purpose=e2e&external_reference=E2E-001`,
      { token }
    );

    assert(internalAudit.verification?.recipient_commitment_matches, 'recipient_commitment mismatch');
    assert(internalAudit.verification?.signature_hash_matches, 'signature_hash mismatch');
    assert(internalAudit.verification?.receipt_hash_matches, 'receipt_hash mismatch');
    assert(internalAudit.verification?.blockchain_hashes_match, 'blockchain_hashes mismatch');

    const onchainDelivery = await stellarService.getVerifiedDistribution(distributionId);
    assert(onchainDelivery, 'No se obtuvo entrega verificada on-chain');

    const verifyHashes = await stellarService.verifyDeliveryHashes(
      distributionId,
      publicAudit.integrity.signature_hash,
      publicAudit.integrity.receipt_hash
    );
    assert(verifyHashes.verified, 'verificar_hashes devolvio false');

    summary.blockchain.delivery_onchain_present = true;
    summary.blockchain.delivery_hashes_verified = true;
    summary.public_audit = {
      tx_id: publicAudit.blockchain.tx_id,
      item_id: publicAudit.item_id,
      quantity: publicAudit.quantity,
      timestamp: publicAudit.timestamp,
    };

    console.log('--- E2E RESULT ---');
    console.log(JSON.stringify(summary, null, 2));
    console.log('E2E COMPLETO: RECEPCION -> DONACION -> DISTRIBUCION -> AUDITORIA -> BLOCKCHAIN OK');
  } catch (error) {
    console.error('E2E FAILED');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
