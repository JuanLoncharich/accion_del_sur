const crypto = require('crypto');

const sha256Hex = (input) => crypto.createHash('sha256').update(input).digest('hex');

const generateSaltHex = (bytes = 16) => crypto.randomBytes(bytes).toString('hex');

const normalizeDoc = (value) => (value || '').toString().trim().toUpperCase();

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

module.exports = {
  sha256Hex,
  generateSaltHex,
  buildRecipientCommitment,
  normalizeSignatureBinary,
  buildSignatureHash,
  buildCanonicalReceipt,
  buildReceiptHash,
  buildCenterGeoHash,
};
