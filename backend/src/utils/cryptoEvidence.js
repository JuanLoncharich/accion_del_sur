const crypto = require('crypto');

const sha256Hex = (input) => crypto.createHash('sha256').update(input).digest('hex');

const generateSaltHex = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');

const normalizeDoc = (value) => (value || '').toString().trim().toUpperCase();
const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase();

const buildRecipientCommitment = ({ docType, docNumber, salt, distributionId }) => {
  const payload = [
    normalizeDoc(docType || 'DNI'),
    normalizeDoc(docNumber),
    salt,
    String(distributionId),
  ].join('||');

  return sha256Hex(payload);
};

const normalizeSignatureBinary = (signatureData) => {
  if (!signatureData) return Buffer.from('');

  const raw = signatureData.toString();
  const commaIdx = raw.indexOf(',');
  const b64 = raw.startsWith('data:') && commaIdx > -1 ? raw.slice(commaIdx + 1) : raw;

  return Buffer.from(b64, 'base64');
};

const buildSignatureHash = (signatureData) => {
  const signatureBinary = normalizeSignatureBinary(signatureData);
  return sha256Hex(signatureBinary);
};

const canonicalize = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }

  return value;
};

const buildCanonicalReceipt = (receipt) => JSON.stringify(canonicalize(receipt));

const buildReceiptHash = (receipt) => {
  const canonicalReceipt = buildCanonicalReceipt(receipt);
  return sha256Hex(canonicalReceipt);
};

const buildCenterGeoHash = ({ centerName, latitude, longitude }) => {
  const payload = [
    (centerName || '').toString().trim().toUpperCase(),
    Number(latitude).toFixed(6),
    Number(longitude).toFixed(6),
  ].join('|');

  return sha256Hex(payload);
};

const buildDonorEmailCommitment = ({ email, salt, receptionId }) => {
  const payload = [
    salt,
    normalizeEmail(email),
    String(receptionId),
  ].join('||');

  return sha256Hex(payload);
};

const buildReceptionAnchorHash = ({
  receptionId,
  donorEmailHash,
  status,
  details,
  rejectionReason,
}) => {
  const normalizedDetails = (details || []).map((detail) => ({
    item_id: Number(detail.item_id),
    quantity_accepted: Number(detail.quantity_accepted || 0),
    quantity_received: Number(detail.quantity_received || 0),
    quantity_rejected: Number(detail.quantity_rejected || 0),
    rejection_reason_item: detail.rejection_reason_item || null,
  }));

  return sha256Hex(buildCanonicalReceipt({
    reception_id: receptionId,
    donor_email_hash: donorEmailHash,
    status,
    rejection_reason: rejectionReason || null,
    details: normalizedDetails,
  }));
};

const buildReceptionSignatureHash = ({ receptionId, donorEmailHash, anchorHash }) => {
  return sha256Hex([
    'RECEPTION_V1',
    String(receptionId),
    donorEmailHash,
    anchorHash,
  ].join('||'));
};

module.exports = {
  sha256Hex,
  generateSaltHex,
  normalizeEmail,
  buildRecipientCommitment,
  normalizeSignatureBinary,
  buildSignatureHash,
  buildCanonicalReceipt,
  buildReceiptHash,
  buildCenterGeoHash,
  buildDonorEmailCommitment,
  buildReceptionAnchorHash,
  buildReceptionSignatureHash,
};
