const crypto = require('crypto');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const {
  DonationReception,
  DonationReceptionDetail,
  Item,
  Donation,
  Center,
  User,
  sequelize,
} = require('../models');
const sftService = require('../services/blockchain/sftService');
const {
  generateSaltHex,
  normalizeEmail,
  buildDonorEmailCommitment,
  buildReceptionAnchorHash,
  buildReceptionSignatureHash,
} = require('../utils/cryptoEvidence');

const PUBLIC_STATUS_LABEL = {
  processing: 'Procesando',
  completed: 'Completada',
  partially_rejected: 'Parcialmente rechazada',
  rejected: 'Rechazada',
  failed_anchor: 'Error de anclaje',
};

const maskedNotFound = (res) => res.status(404).json({ error: 'No se encontró la confirmación solicitada' });

const buildQrUrl = (token) => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/confirmacion-donacion/${token}`;
};

const buildPublicPayload = (reception, acceptedTracking) => {
  const isFinal = reception.status !== 'processing';

  return {
    token: reception.public_token_qr,
    status: reception.status,
    status_label: PUBLIC_STATUS_LABEL[reception.status] || reception.status,
    privacy_notice: 'Email visible solo para quien tenga el QR. No se publica en listados generales.',
    donor_email: reception.donor_email,
    rejection_reason: isFinal ? reception.rejection_reason : null,
    finalized_at: reception.finalized_at,
    items: isFinal
      ? (reception.details || []).map((detail) => ({
          item_id: detail.item_id,
          item_name: detail.item?.name || `Ítem #${detail.item_id}`,
          quantity_received: detail.quantity_received,
          quantity_accepted: detail.quantity_accepted,
          quantity_rejected: detail.quantity_rejected,
          rejection_reason_item: detail.rejection_reason_item,
        }))
      : [],
    blockchain: {
      available: Boolean(reception.anchored_tx_id && reception.anchored_hash),
      tx_id: reception.anchored_tx_id,
      anchored_hash: reception.anchored_hash,
    },
    accepted_tracking: acceptedTracking,
  };
};

const validateFinalizePayload = (details = [], rejectionReason) => {
  if (!Array.isArray(details) || details.length === 0) {
    return 'Debe enviar al menos un ítem de detalle';
  }

  let acceptedTotal = 0;
  let rejectedTotal = 0;

  for (const detail of details) {
    const received = Number(detail.quantity_received);
    const accepted = Number(detail.quantity_accepted);
    const rejected = Number(detail.quantity_rejected || 0);

    if (!Number.isInteger(received) || received <= 0) {
      return 'quantity_received debe ser entero mayor a 0';
    }

    if (!Number.isInteger(accepted) || accepted < 0) {
      return 'quantity_accepted debe ser entero mayor o igual a 0';
    }

    if (!Number.isInteger(rejected) || rejected < 0) {
      return 'quantity_rejected debe ser entero mayor o igual a 0';
    }

    if (accepted + rejected !== received) {
      return 'quantity_accepted + quantity_rejected debe coincidir con quantity_received';
    }

    acceptedTotal += accepted;
    rejectedTotal += rejected;
  }

  if (acceptedTotal === 0 && rejectedTotal === 0) {
    return 'Debe existir cantidad aceptada o rechazada';
  }

  const needsReason = rejectedTotal > 0;
  if (needsReason) {
    const hasGlobalReason = Boolean((rejectionReason || '').trim());
    const allRejectedItemsHaveReason = details
      .filter((d) => Number(d.quantity_rejected || 0) > 0)
      .every((d) => Boolean((d.rejection_reason_item || '').trim()));

    if (!hasGlobalReason && !allRejectedItemsHaveReason) {
      return 'Debe informar razón global o razón por ítem para cantidades rechazadas';
    }
  }

  return null;
};

const computeStatus = (details) => {
  const acceptedTotal = details.reduce((sum, d) => sum + Number(d.quantity_accepted || 0), 0);
  const rejectedTotal = details.reduce((sum, d) => sum + Number(d.quantity_rejected || 0), 0);

  if (rejectedTotal === 0 && acceptedTotal > 0) return 'completed';
  if (acceptedTotal > 0 && rejectedTotal > 0) return 'partially_rejected';
  return 'rejected';
};

const isStellarEnabled = () => process.env.STELLAR_ENABLED === 'true';
const isSftEnabled = () => isStellarEnabled() && Boolean(process.env.SOROBAN_CONTRACT_SFT);
const isValidTokenIdHex = (value) => /^[a-f0-9]{64}$/i.test(String(value || '').trim());

exports.createInitial = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const donorEmailNormalized = normalizeEmail(req.body.donor_email);
    const publicToken = crypto.randomBytes(24).toString('hex');
    const salt = generateSaltHex(16);

    const reception = await DonationReception.create({
      public_token_qr: publicToken,
      donor_email: donorEmailNormalized,
      donor_email_salt: salt,
      donor_email_hash: 'pending',
      status: 'processing',
      created_by: req.user.id,
    });

    const donorHash = buildDonorEmailCommitment({
      email: donorEmailNormalized,
      salt,
      receptionId: reception.id,
    });

    await reception.update({ donor_email_hash: donorHash });

    return res.status(201).json({
      id: reception.id,
      public_token_qr: publicToken,
      qr_url: buildQrUrl(publicToken),
      status: reception.status,
    });
  } catch (error) {
    next(error);
  }
};

exports.listInternal = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = {};

    if (status) {
      where.status = status;
    }

    const { count, rows } = await DonationReception.findAndCountAll({
      where,
      include: [
        {
          model: DonationReceptionDetail,
          as: 'details',
          include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
        },
        { model: User, as: 'createdBy', attributes: ['id', 'username'] },
        { model: User, as: 'finalizedBy', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });

    return res.json({ total: count, page: Number(page), data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getPublicByToken = async (req, res, next) => {
  try {
    const reception = await DonationReception.findOne({
      where: { public_token_qr: req.params.token },
      include: [{
        model: DonationReceptionDetail,
        as: 'details',
        include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
      }],
    });

    if (!reception) return maskedNotFound(res);

    const donorDonations = await Donation.findAll({
      where: {
        donor_email: reception.donor_email,
        status: 'anchored',
      },
      include: [
        { model: Item, as: 'item', attributes: ['id', 'name'] },
        { model: Center, as: 'center', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 30,
    });

    const acceptedTotal = donorDonations.reduce((sum, donation) => sum + Number(donation.quantity || 0), 0);
    const mintedTotal = donorDonations
      .filter((donation) => Boolean(donation.blockchain_tx_id || donation.blockchain_hash))
      .reduce((sum, donation) => sum + Number(donation.quantity || 0), 0);

    const acceptedTracking = {
      accepted_total: acceptedTotal,
      minted_total: mintedTotal,
      donations: donorDonations.map((donation) => ({
        donation_id: donation.id,
        item_name: donation.item?.name || `Ítem #${donation.item_id}`,
        quantity: donation.quantity,
        center_name: donation.center?.name || donation.center_name || null,
        minted: Boolean(donation.blockchain_tx_id || donation.blockchain_hash),
        blockchain_tx_id: donation.blockchain_tx_id,
        created_at: donation.created_at,
      })),
    };

    return res.json(buildPublicPayload(reception, acceptedTracking));
  } catch (error) {
    next(error);
  }
};

exports.finalizeInternal = async (req, res, next) => {
  try {
    // ── 1. Cargar la recepción ────────────────────────────────────────────────
    const reception = await DonationReception.findByPk(req.params.id);
    if (!reception) {
      return res.status(404).json({ error: 'Recepción no encontrada' });
    }
    if (reception.status !== 'processing') {
      return res.status(409).json({ error: 'Solo se puede finalizar una recepción en processing' });
    }

    const { details = [], rejection_reason, center_id } = req.body;

    // ── 2. Validar payload ────────────────────────────────────────────────────
    const payloadError = validateFinalizePayload(details, rejection_reason);
    if (payloadError) {
      return res.status(400).json({ error: payloadError });
    }

    // ── 3. Validar centro si blockchain está habilitado ───────────────────────
    let center = null;
    if (isSftEnabled()) {
      if (!center_id) {
        return res.status(400).json({
          error: 'center_id es requerido cuando blockchain está habilitado',
        });
      }
      center = await Center.findByPk(center_id);
      if (!center || !center.is_active) {
        return res.status(404).json({ error: 'Centro no encontrado o inactivo' });
      }
      if (!center.blockchain_contract_id) {
        return res.status(400).json({
          error: `El centro "${center.name}" no tiene contrato blockchain desplegado`,
        });
      }
    }

    // ── 4. Cargar ítems ───────────────────────────────────────────────────────
    const itemIds = [...new Set(details.map((d) => Number(d.item_id)))];
    const items = await Item.findAll({
      where: { id: { [Op.in]: itemIds }, is_active: true },
      include: [{ model: require('../models').Category, as: 'category' }],
    });

    if (items.length !== itemIds.length) {
      return res.status(400).json({ error: 'Uno o más ítems no son válidos o están inactivos' });
    }

    const itemsById = items.reduce((acc, item) => { acc[item.id] = item; return acc; }, {});

    const normalizedDetails = details.map((detail) => ({
      item_id: Number(detail.item_id),
      quantity_received: Number(detail.quantity_received),
      quantity_accepted: Number(detail.quantity_accepted),
      quantity_rejected: Number(detail.quantity_rejected || 0),
      rejection_reason_item: (detail.rejection_reason_item || null),
    }));

    const nextStatus = computeStatus(normalizedDetails);
    const anchorHash = buildReceptionAnchorHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      status: nextStatus,
      details: normalizedDetails,
      rejectionReason: rejection_reason,
    });
    const signatureHash = buildReceptionSignatureHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      anchorHash,
    });

    // ── 5. Blockchain primero (si habilitado) ─────────────────────────────────
    const mintResults = []; // { item_id, tokenId, txId, hash }

    if (isSftEnabled()) {
      for (const detail of normalizedDetails) {
        if (detail.quantity_accepted <= 0) continue;

        const item = itemsById[detail.item_id];
        const tokenId = isValidTokenIdHex(item.blockchain_hash)
          ? String(item.blockchain_hash).trim().toLowerCase()
          : sftService.computeTokenId(item.id);
        const attributesHash = sftService.computeAttributesHash(item.attributes);

        try {
          const mintResult = await sftService.mintToCenter({
            toCenterAddress: center.blockchain_contract_id,
            tokenId,
            metadata: {
              item_id: item.id,
              categoria: item.category?.name || 'sin_categoria',
              nombre: item.name,
              attributes_hash: attributesHash,
            },
            cantidad: detail.quantity_accepted,
            firmaHash: signatureHash,
          });
          mintResults.push({ item_id: item.id, tokenId, txId: mintResult.txId, hash: mintResult.hash });
        } catch (blockchainError) {
          console.error(`[SFT] Error en mint de item_id=${item.id}:`, blockchainError.message);
          // Blockchain-first: si falla el mint, retornar 503 sin escribir nada en MySQL
          return res.status(503).json({
            error: 'Error al registrar en blockchain. No se guardó ningún dato.',
            detail: blockchainError.message,
          });
        }
      }
    }

    // ── 6. MySQL (solo si blockchain confirmó todo) ───────────────────────────
    const t = await sequelize.transaction();
    try {
      // Bloquear recepción para evitar doble finalización concurrente
      const receptionLocked = await DonationReception.findByPk(reception.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (receptionLocked.status !== 'processing') {
        await t.rollback();
        return res.status(409).json({ error: 'La recepción ya fue finalizada por otra operación' });
      }

      for (const detail of normalizedDetails) {
        const item = itemsById[detail.item_id];

        // Incrementar stock y asignar al centro receptor
        await item.update(
          {
            quantity: item.quantity + detail.quantity_accepted,
            ...(center_id && detail.quantity_accepted > 0 ? { current_center_id: center_id } : {}),
          },
          { transaction: t }
        );

        if (detail.quantity_accepted > 0) {
          // Buscar el tx_id del mint de este ítem
          const mintInfo = mintResults.find((m) => m.item_id === item.id);

          const mintedPatch = {
            token_status: 'minted',
          };
          if (mintInfo && !item.blockchain_hash) {
            mintedPatch.blockchain_hash = mintInfo.tokenId;
            mintedPatch.blockchain_tx_id = mintInfo.txId;
          }
          await item.update(mintedPatch, { transaction: t });

          // Registrar donación vinculada a esta recepción
          await Donation.create({
            item_id: item.id,
            quantity: detail.quantity_accepted,
            notes: `Recepción QR #${reception.id}`,
            registered_by: req.user.id,
            status: 'anchored',
            donor_email: reception.donor_email,
            donation_reception_id: reception.id,
            blockchain_hash: mintInfo?.tokenId || null,
            blockchain_tx_id: mintInfo?.txId || null,
            ...(center_id ? { center_id } : {}),
          }, { transaction: t });
        }
      }

      await DonationReceptionDetail.bulkCreate(
        normalizedDetails.map((detail) => ({
          reception_id: reception.id,
          ...detail,
        })),
        { transaction: t }
      );

      // El anchored_tx_id será el tx del primer mint (o null si no hubo blockchain)
      const firstMintTx = mintResults[0]?.txId || null;

      await receptionLocked.update({
        status: nextStatus,
        rejection_reason: rejection_reason || null,
        anchored_hash: anchorHash,
        anchored_tx_id: firstMintTx,
        finalized_by: req.user.id,
        finalized_at: new Date(),
      }, { transaction: t });

      await t.commit();
    } catch (dbError) {
      await t.rollback();
      throw dbError;
    }

    // ── 7. Respuesta ──────────────────────────────────────────────────────────
    const refreshed = await DonationReception.findByPk(reception.id, {
      include: [{
        model: DonationReceptionDetail,
        as: 'details',
        include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
      }],
    });

    return res.json({
      id: refreshed.id,
      status: refreshed.status,
      public_token_qr: refreshed.public_token_qr,
      qr_url: buildQrUrl(refreshed.public_token_qr),
      blockchain: {
        enabled: isSftEnabled(),
        mints: mintResults.map((m) => ({ item_id: m.item_id, tx_id: m.txId })),
        anchored_hash: refreshed.anchored_hash,
      },
      details: refreshed.details,
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyPublicAnchor = async (req, res, next) => {
  try {
    const reception = await DonationReception.findOne({
      where: { public_token_qr: req.params.token },
      include: [{ model: DonationReceptionDetail, as: 'details' }],
    });

    if (!reception) return maskedNotFound(res);

    if (!reception.anchored_hash || !reception.finalized_at) {
      return res.status(409).json({ verified: false, message: 'La recepción aún no tiene anclaje disponible' });
    }

    const computedStatus = computeStatus(reception.details || []);

    const localAnchorHash = buildReceptionAnchorHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      status: computedStatus,
      details: reception.details,
      rejectionReason: reception.rejection_reason,
    });

    const localMatch = localAnchorHash === reception.anchored_hash;

    // Con el sistema SFT, la verificación blockchain se basa en que el
    // anchored_tx_id apunte a una transacción real de mint en Stellar.
    // La verificación local (comparar hash recalculado vs almacenado)
    // es suficiente para probar integridad de los datos.
    const hasBlockchainAnchor = Boolean(reception.anchored_tx_id);

    return res.json({
      verified: localMatch,
      local_match: localMatch,
      blockchain_anchored: hasBlockchainAnchor,
      message: localMatch
        ? 'La recepción coincide con el anclaje almacenado'
        : 'El hash local no coincide con el hash almacenado — posible manipulación',
      tx_id: reception.anchored_tx_id,
      anchored_hash: reception.anchored_hash,
    });
  } catch (error) {
    next(error);
  }
};
