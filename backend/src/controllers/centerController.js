const crypto = require('crypto');
const { Center, User, Item, sequelize } = require('../models');
const stellarService = require('../services/blockchain/stellarService');

const isStellarEnabled = () => process.env.STELLAR_ENABLED === 'true';

exports.create = async (req, res, next) => {
  try {
    const { name, latitude, longitude } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Se requiere name' });
    }

    const normalizedLatitude = latitude == null || latitude === '' ? null : Number(latitude);
    const normalizedLongitude = longitude == null || longitude === '' ? null : Number(longitude);

    if (normalizedLatitude != null && Number.isNaN(normalizedLatitude)) {
      return res.status(400).json({ error: 'latitude inválida' });
    }

    if (normalizedLongitude != null && Number.isNaN(normalizedLongitude)) {
      return res.status(400).json({ error: 'longitude inválida' });
    }

    const latForChain = normalizedLatitude ?? 0;
    const lngForChain = normalizedLongitude ?? 0;

    const geoHash = crypto.createHash('sha256')
      .update(`${name}|${Number(latForChain).toFixed(6)}|${Number(lngForChain).toFixed(6)}`)
      .digest('hex');

    // ── Blockchain-first: si blockchain está habilitado, el contrato
    //    debe desplegarse ANTES de crear el registro en MySQL ──────────
    let blockchainContractId = null;
    let deployTx = null;
    let initTx = null;

    if (isStellarEnabled()) {
      try {
        const deployResult = await stellarService.deployCenterContract();
        blockchainContractId = deployResult.contractId;
        deployTx = deployResult.txId;

        const initResult = await stellarService.initializeCenter(blockchainContractId, {
          nombre: name,
          lat_e6: Math.round(Number(latForChain) * 1_000_000),
          lng_e6: Math.round(Number(lngForChain) * 1_000_000),
          geo_hash: geoHash,
        });
        initTx = initResult.txId;

        console.log(`[Center] Contrato desplegado: ${blockchainContractId}`);
      } catch (blockchainError) {
        console.error(`[Center] Error blockchain para centro "${name}":`, blockchainError.message);
        // Blockchain-first: si falla → 503, no se crea nada en DB
        return res.status(503).json({
          error: 'Error al desplegar contrato blockchain para el centro. No se guardó ningún dato.',
          detail: blockchainError.message,
        });
      }
    }

    // ── MySQL: solo se escribe si blockchain confirmó (o si está deshabilitado) ──
    const center = await Center.create({
      name,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      geo_hash: geoHash,
      blockchain_contract_id: blockchainContractId,
      blockchain_deploy_tx: deployTx,
      blockchain_init_tx: initTx,
      created_by: req.user.id,
    });

    console.log(`[Center] Centro "${name}" creado (id=${center.id}, contract=${blockchainContractId || 'sin blockchain'})`);

    const result = await Center.findByPk(center.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'username'] }],
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { active } = req.query;
    const where = {};
    if (active !== undefined) {
      where.is_active = active === 'true';
    }

    const centers = await Center.findAll({
      where,
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'username'] }],
      order: [['created_at', 'DESC']],
    });

    res.json({ data: centers });
  } catch (error) {
    next(error);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id, {
      include: [{ model: User, as: 'createdBy', attributes: ['id', 'username'] }],
    });

    if (!center) {
      return res.status(404).json({ error: 'Centro no encontrado' });
    }

    res.json(center);
  } catch (error) {
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) {
      return res.status(404).json({ error: 'Centro no encontrado' });
    }

    await center.update({ is_active: false });
    res.json({ message: 'Centro desactivado', center });
  } catch (error) {
    next(error);
  }
};

exports.getInventory = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) {
      return res.status(404).json({ error: 'Centro no encontrado' });
    }

    // Items currently at this center (from DB)
    const { Category } = require('../models');
    const items = await Item.findAll({
      where: { current_center_id: center.id, is_active: true },
      include: [{ model: Category, as: 'category' }],
    });

    // Also try to get on-chain inventory if contract exists
    let onChainInventory = null;
    if (center.blockchain_contract_id) {
      try {
        const sftService = require('../services/blockchain/sftService');
        const tokenIds = await sftService.getCenterInventory(center.blockchain_contract_id);
        onChainInventory = { token_ids: tokenIds };
      } catch (e) {
        console.error('[Center] Error leyendo inventario SFT on-chain:', e.message);
      }
    }

    res.json({
      center_id: center.id,
      center_name: center.name,
      blockchain_contract_id: center.blockchain_contract_id,
      items,
      onChainInventory,
    });
  } catch (error) {
    next(error);
  }
};
