import { Router } from 'express';
import crypto from 'node:crypto';
import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import User from '../models/User.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { assertWarehouseAccess, visibleWarehouseFilter } from '../utils/permissions.js';
import { changeStock, runInventoryTransaction } from '../utils/stock.js';
import { notifyLowStock } from '../utils/lowStock.js';

const router = Router();
router.use(protect);

async function sendLowStockNotice(productId, warehouseId) {
  try {
    return await notifyLowStock(productId, warehouseId);
  } catch (error) {
    console.error('Stock was updated, but the low-stock email could not be sent:', error);
    return 'Stock was updated, but the low-stock email could not be sent. Check SMTP settings.';
  }
}

router.get('/low', allowRoles('admin', 'warehouseManager', 'salesRepresentative'), asyncHandler(async (req, res) => {
  const warehouseFilter = visibleWarehouseFilter(req.user);
  const stock = await Stock.find({ quantity: { $gte: 0 }, ...(
    Object.keys(warehouseFilter).length ? { warehouse: warehouseFilter._id } : {}
  ) }).populate('product', 'name sku category lowStockLimit imageUrl price')
    .populate('warehouse', 'name location');
  res.json({
    stock: stock.filter((row) => row.product && row.quantity <= row.product.lowStockLimit)
  });
}));

router.get('/', allowRoles('admin', 'warehouseManager', 'salesRepresentative'), asyncHandler(async (req, res) => {
  const filter = {};
  const visible = visibleWarehouseFilter(req.user);
  if (visible._id) filter.warehouse = visible._id;
  if (req.query.warehouse) {
    assertWarehouseAccess(req.user, req.query.warehouse);
    filter.warehouse = req.query.warehouse;
  }
  if (req.query.product) filter.product = req.query.product;
  const stock = await Stock.find(filter)
    .populate('product', 'name sku category lowStockLimit imageUrl price')
    .populate('warehouse', 'name location')
    .sort({ updatedAt: -1 });
  res.json({ stock });
}));

router.get('/history', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const filter = {};
  const visible = visibleWarehouseFilter(req.user);
  if (visible._id) filter.warehouse = visible._id;
  if (req.query.warehouse) {
    assertWarehouseAccess(req.user, req.query.warehouse);
    filter.warehouse = req.query.warehouse;
  }
  const transactions = await StockTransaction.find(filter)
    .populate('product', 'name sku')
    .populate('warehouse', 'name')
    .populate('performedBy', 'name role')
    .sort({ date: -1 })
    .limit(500);
  res.json({ transactions });
}));

router.post('/in', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const { product: productId, warehouse: warehouseId, quantity, note = 'Stock received' } = req.body;
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error('Quantity must be a positive whole number.');
    error.status = 400;
    throw error;
  }
  assertWarehouseAccess(req.user, warehouseId);
  if (!(await Product.exists({ _id: productId })) || !(await Warehouse.exists({ _id: warehouseId }))) {
    const error = new Error('Choose an existing product and warehouse.');
    error.status = 400;
    throw error;
  }
  await runInventoryTransaction((session) => changeStock({
    productId, warehouseId, quantity: amount, direction: 'in',
    performedBy: req.user._id, note, session
  }));
  await audit(req.user, 'stock-in', 'product', productId, { warehouse: warehouseId, quantity: amount });
  const warning = await sendLowStockNotice(productId, warehouseId);
  const stock = await Stock.findOne({ product: productId, warehouse: warehouseId });
  res.status(201).json({ stock, ...(warning ? { warning } : {}) });
}));

router.post('/out', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const { product: productId, warehouse: warehouseId, quantity, note = 'Stock removed' } = req.body;
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error('Quantity must be a positive whole number.');
    error.status = 400;
    throw error;
  }
  assertWarehouseAccess(req.user, warehouseId);
  await runInventoryTransaction((session) => changeStock({
    productId, warehouseId, quantity: amount, direction: 'out',
    performedBy: req.user._id, note, session
  }));
  await audit(req.user, 'stock-out', 'product', productId, { warehouse: warehouseId, quantity: amount });
  const warning = await sendLowStockNotice(productId, warehouseId, res);
  const stock = await Stock.findOne({ product: productId, warehouse: warehouseId });
  res.json({ stock, ...(warning ? { warning } : {}) });
}));

router.post('/transfer', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const { product: productId, fromWarehouse, toWarehouse, quantity, note = '' } = req.body;
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0 || !fromWarehouse || !toWarehouse || fromWarehouse === toWarehouse) {
    const error = new Error('Choose two different warehouses and a positive whole-number quantity.');
    error.status = 400;
    throw error;
  }
  assertWarehouseAccess(req.user, fromWarehouse);
  assertWarehouseAccess(req.user, toWarehouse);
  if (!(await Product.exists({ _id: productId }))) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }
  const transferGroup = crypto.randomUUID();
  await runInventoryTransaction(async (session) => {
    const source = await Stock.findOneAndUpdate(
      { product: productId, warehouse: fromWarehouse, quantity: { $gte: amount } },
      { $inc: { quantity: -amount } },
      { new: true, session }
    );
    if (!source) {
      const error = new Error('Insufficient stock in the source warehouse.');
      error.status = 409;
      throw error;
    }
    await Stock.findOneAndUpdate(
      { product: productId, warehouse: toWarehouse },
      { $inc: { quantity: amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    await StockTransaction.create([
      {
        product: productId, warehouse: fromWarehouse, transactionType: 'transfer-out',
        quantity: amount, note: note || `Transfer to ${toWarehouse}`, transferGroup, performedBy: req.user._id
      },
      {
        product: productId, warehouse: toWarehouse, transactionType: 'transfer-in',
        quantity: amount, note: note || `Transfer from ${fromWarehouse}`, transferGroup, performedBy: req.user._id
      }
    ], { session });
  });
  await audit(req.user, 'transferred', 'product', productId, {
    fromWarehouse, toWarehouse, quantity: amount, transferGroup
  });
  const warnings = [];
  for (const warehouseId of [fromWarehouse, toWarehouse]) {
    const warning = await sendLowStockNotice(productId, warehouseId);
    if (warning) warnings.push(warning);
  }
  res.status(201).json({
    transferGroup,
    ...(warnings.length ? { warning: [...new Set(warnings)].join(' ') } : {}),
    stock: await Stock.find({
      product: productId,
      warehouse: { $in: [fromWarehouse, toWarehouse] }
    }).populate('warehouse', 'name')
  });
}));

export default router;
