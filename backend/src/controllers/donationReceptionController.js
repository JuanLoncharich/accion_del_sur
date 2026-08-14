const crypto = require('crypto');
const { Reception, ReceptionDetail, Item, Category, Center, sequelize } = require('../models');
const cryptoEvidence = require('../utils/cryptoEvidence');
const sftService = require('../services/blockchain/sftService');
const stellarService = require('../services/blockchain/stellarService');

const PUBLIC_BASE = process.env.FRONTEND_URL || 'http://localhost:5173';

const serializeList = (r) => ({
  id: r.id,
  donor_email: r.donor_email,
  status: r.status,
  created_at: r.created_at,
  public_token_qr: r.token,
});

// GET /api/donation-receptions
exports.listInternal = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const rows = await Reception.findAll({
      include: [{ model: ReceptionDetail, as: 'details' }],
      order: [['created_at', 'DESC']],
      limit,
    });
    res.json({ total: rows.length, page: Number(req.query.page || 1), data: rows.map(serializeList) });
  } catch (error) { next(error); }
};

// POST /api/donation-receptions  { donor_email }
exports.createInitial = async (req, res, next) => {
  try {
    const donor_email = (req.body.donor_email || '').toString().trim();
    if (!donor_email) return res.status(400).json({ error: 'Email del donador requerido' });

    const token = crypto.randomBytes(24).toString('hex');
    const salt = cryptoEvidence.generateSaltHex(16);
    const reception = await Reception.create({
      token,
      donor_email,
      salt,
      status: 'processing',
      reception_center_id: req.body.reception_center_id || null,
      donor_email_hash: '0'.repeat(64),
    });

    // El commitment necesita el id de la recepción creada.
    reception.donor_email_hash = cryptoEvidence.buildDonorEmailCommitment({
      email: donor_email, salt, receptionId: reception.id,
    });
    await reception.save();

    res.status(201).json({
      id: reception.id,
      donor_email: reception.donor_email,
      status: reception.status,
      public_token_qr: token,
      qr_url: `${PUBLIC_BASE}/confirmacion-donacion/${token}`,
    });
  } catch (error) { next(error); }
};

// POST /api/donation-receptions/:id/finalize  { details:[...], rejection_reason }
exports.finalizeInternal = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const reception = await Reception.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reception) { await t.rollback(); return res.status(404).json({ error: 'Recepción no encontrada' }); }
    if (reception.status !== 'processing') { await t.rollback(); return res.status(409).json({ error: 'La recepción ya fue finalizada' }); }

    const rawDetails = Array.isArray(req.body.details) ? req.body.details : [];
    if (!rawDetails.length) { await t.rollback(); return res.status(400).json({ error: 'Debe enviar al menos un detalle' }); }

    const details = rawDetails.map((d) => ({
      reception_id: reception.id,
      item_id: Number(d.item_id),
      quantity_received: Number(d.quantity_received || 0),
      quantity_accepted: Number(d.quantity_accepted || 0),
      quantity_rejected: Number(d.quantity_rejected || 0),
      rejection_reason_item: d.rejection_reason_item || null,
    }));

    const totalAccepted = details.reduce((a, d) => a + Number(d.quantity_accepted || 0), 0);
    const totalRejected = details.reduce((a, d) => a + Number(d.quantity_rejected || 0), 0);
    let status = 'completed';
    if (totalAccepted === 0) status = 'rejected';
    else if (totalRejected > 0) status = 'partially_rejected';

    const anchorHash = cryptoEvidence.buildReceptionAnchorHash({
      receptionId: reception.id, donorEmailHash: reception.donor_email_hash,
      status, details, rejectionReason: req.body.rejection_reason || null,
    });
    const signatureHash = cryptoEvidence.buildReceptionSignatureHash({
      receptionId: reception.id, donorEmailHash: reception.donor_email_hash, anchorHash,
    });

    for (const d of details) {
      await ReceptionDetail.create(d, { transaction: t });
      if (d.quantity_accepted > 0) {
        const item = await Item.findByPk(d.item_id, { transaction: t, lock: t.LOCK.UPDATE });
        if (item) {
          await item.actualizarStock(d.quantity_accepted, { transaction: t });
          if (reception.reception_center_id) item.current_center_id = reception.reception_center_id;
          if (item.changed()) await item.save({ transaction: t });
        }
      }
    }

    reception.status = status;
    reception.anchor_hash = anchorHash;
    reception.signature_hash = signatureHash;
    reception.rejection_reason = req.body.rejection_reason || null;
    reception.operator_id = req.user.id;
    await reception.save({ transaction: t });

    await t.commit();

    // Blockchain (mint SFT + anclaje) fuera de la transacción; degradación graceful.
    await tryBlockchainFinalize(reception, details);

    res.json({
      id: reception.id, status: reception.status, anchor_hash: reception.anchor_hash,
      blockchain_tx: reception.blockchain_tx,
    });
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    next(error);
  }
};

async function tryBlockchainFinalize(reception, details) {
  try {
    if (!sftService.isEnabled) return; // sin blockchain configurado → queda en local
    const center = reception.reception_center_id ? await Center.findByPk(reception.reception_center_id) : null;
    const toCenterAddress = center && center.blockchain_contract_id;
    if (!toCenterAddress) return; // el centro aún no tiene contrato desplegado (Fase 5)

    let mintedTotal = 0;
    for (const d of details) {
      if (Number(d.quantity_accepted) <= 0) continue;
      const item = await Item.findByPk(d.item_id, { include: [{ model: Category, as: 'category' }] });
      if (!item) continue;
      const tokenId = sftService.computeTokenId(item.id);
      const metadata = {
        item_id: item.id,
        categoria: item.category ? item.category.name : '',
        nombre: item.name,
        attributes_hash: item.attributes_hash || '0'.repeat(64),
      };
      await sftService.mintToCenter({ toCenterAddress, tokenId, metadata, cantidad: Number(d.quantity_accepted), firmaHash: reception.signature_hash });
      mintedTotal += Number(d.quantity_accepted);
      if (!item.token_id) { item.token_id = tokenId; await item.save(); }
    }

    const anchor = await stellarService.anchorDonationReception({
      receptionId: reception.id, donorEmailHash: reception.donor_email_hash,
      anchorHash: reception.anchor_hash, signatureHash: reception.signature_hash,
      operatorId: reception.operator_id, totalAcceptedQuantity: mintedTotal,
    });
    if (anchor && (anchor.txId || anchor.hash)) {
      reception.blockchain_hash = anchor.hash;
      reception.blockchain_tx = anchor.txId;
      await reception.save();
    }
  } catch (error) {
    console.error('[Reception] blockchain error (queda en local):', error.message);
  }
}

// GET /api/donation-receptions/public/:token  (público)
exports.getPublicByToken = async (req, res, next) => {
  try {
    const reception = await Reception.findOne({
      where: { token: req.params.token },
      include: [{ model: ReceptionDetail, as: 'details', include: [{ model: Item, as: 'item' }] }],
    });
    if (!reception) return res.status(404).json({ error: 'Recepción no encontrada' });

    const items = (reception.details || []).map((d) => ({
      item_id: d.item_id,
      item_name: d.item ? d.item.name : 'Ítem',
      quantity_received: d.quantity_received,
      quantity_accepted: d.quantity_accepted,
      quantity_rejected: d.quantity_rejected,
      rejection_reason_item: d.rejection_reason_item,
    }));
    const accepted_total = items.reduce((a, i) => a + Number(i.quantity_accepted || 0), 0);
    const center = reception.reception_center_id ? await Center.findByPk(reception.reception_center_id) : null;
    const donations = items
      .filter((i) => i.quantity_accepted > 0)
      .map((i) => ({
        donation_id: `${reception.id}-${i.item_id}`,
        item_name: i.item_name,
        center_name: center ? center.name : null,
        quantity: i.quantity_accepted,
        minted: !!reception.blockchain_tx,
      }));

    res.json({
      status: reception.status,
      donor_email: reception.donor_email,
      privacy_notice: 'Tu correo se almacena solo con fines de trazabilidad y no se comparte públicamente.',
      accepted_tracking: {
        accepted_total,
        minted_total: reception.blockchain_tx ? accepted_total : 0,
        donations,
      },
      items,
      rejection_reason: reception.rejection_reason,
      blockchain: { available: !!reception.blockchain_tx },
    });
  } catch (error) { next(error); }
};

// GET /api/donation-receptions/public/:token/verify  (público)
exports.verifyPublicAnchor = async (req, res, next) => {
  try {
    const reception = await Reception.findOne({ where: { token: req.params.token } });
    if (!reception) return res.status(404).json({ error: 'Recepción no encontrada' });
    if (!reception.anchor_hash || !reception.signature_hash) {
      return res.json({ verified: false, message: 'La recepción aún no fue anclada.' });
    }
    const v = await stellarService.verifyDonationReceptionAnchor({
      receptionId: reception.id, signatureHash: reception.signature_hash, anchorHash: reception.anchor_hash,
    });
    res.json({
      verified: !!v.verified,
      message: v.verified
        ? 'El hash anclado coincide con el detalle de la recepción.'
        : (v.reason || 'No verificado'),
    });
  } catch (error) { next(error); }
};
