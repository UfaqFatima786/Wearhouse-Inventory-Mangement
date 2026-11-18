import { Router } from 'express';
import SupplyRequest from '../models/SupplyRequest.js';
import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { assertWarehouseAccess, visibleWarehouseFilter } from '../utils/permissions.js';
import { runInventoryTransaction } from '../utils/stock.js';
import { notifyLowStock } from '../utils/lowStock.js';

const router = Router();
router.use(protect);

router.post('/', allowRoles('supplier'), asyncHandler(async (req, res) => {
  const { product, warehouse, quantity } = req.body;
  const amount = Number(quantity);
  if (!Number.isInteger(amount) || amount <= 0) {
    const error = new Error('Quantity must be a positive whole number.');
    error.status = 400;
    throw error;
  }
  const productExists = await Product.exists({ _id: product, supplier: req.user._id });
  if (!productExists || !(await Warehouse.exists({ _id: warehouse }))) {
    const error = new Error('Choose one of your products and a valid warehouse.');
    error.status = 400;
    throw error;
  }
  const request = await SupplyRequest.create({
    supplier: req.user._id, product, warehouse, quantity: amount
  });
  await audit(req.user, 'submitted', 'supply-request', request._id, { quantity: amount });
  res.status(201).json({ request });
}));

router.get('/', asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'supplier') filter.supplier = req.user._id;
  else if (req.user.role === 'warehouseManager') {
    filter.warehouse = { $in: req.user.assignedWarehouses };
  } else if (req.user.role !== 'admin') {
    const error = new Error('You cannot view supply requests.');
    error.status = 403;
    throw error;
  }
  const requests = await SupplyRequest.find(filter)
    .populate('supplier', 'name email')
    .populate('product', 'name sku')
    .populate('warehouse', 'name')
    .populate('reviewedBy', 'name')
    .sort({ createdAt: -1 });
  res.json({ requests });
}));

router.put('/:id/status', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    const error = new Error('Choose Approved or Rejected.');
    error.status = 400;
    throw error;
  }
  const request = await SupplyRequest.findById(req.params.id);
  if (!request) {
    const error = new Error('Supply request not found.');
    error.status = 404;
    throw error;
  }
  assertWarehouseAccess(req.user, request.warehouse);
  if (request.status !== 'Pending') {
    const error = new Error('This supply request has already been reviewed.');
    error.status = 409;
    throw error;
  }
  if (status === 'Approved') {
    await runInventoryTransaction(async (session) => {
      const updated = await SupplyRequest.findOneAndUpdate(
        { _id: request._id, status: 'Pending' },
        { $set: { status, reviewedBy: req.user._id } },
        { new: true, session }
      );
      if (!updated) {
        const error = new Error('This request was already reviewed.');
        error.status = 409;
        throw error;
      }
      await Stock.findOneAndUpdate(
        { product: request.product, warehouse: request.warehouse },
        { $inc: { quantity: request.quantity } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );
      await StockTransaction.create([{
        product: request.product,
        warehouse: request.warehouse,
        transactionType: 'stock-in',
        quantity: request.quantity,
        note: `Approved supplier request ${request._id}`,
        performedBy: req.user._id
      }], { session });
    });
  } else {
    const updated = await SupplyRequest.findOneAndUpdate(
      { _id: request._id, status: 'Pending' },
      { $set: { status, reviewedBy: req.user._id } },
      { new: true }
    );
    if (!updated) {
      const error = new Error('This request was already reviewed.');
      error.status = 409;
      throw error;
    }
  }
  await audit(req.user, `supply-request-${status.toLowerCase()}`, 'supply-request', request._id);
  let warning;
  if (status === 'Approved') {
    try {
      warning = await notifyLowStock(request.product, request.warehouse);
    } catch (error) {
      console.error('Supply request was approved, but low-stock email status could not be updated:', error);
      warning = 'Supply request was approved, but the low-stock email status could not be updated.';
    }
  }
  res.json({
    request: await SupplyRequest.findById(request._id).populate('supplier product warehouse reviewedBy'),
    ...(warning ? { warning } : {})
  });
}));

export default router;
