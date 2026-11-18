import { Router } from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Stock from '../models/Stock.js';
import Warehouse from '../models/Warehouse.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { assertWarehouseAccess } from '../utils/permissions.js';
import { changeStock } from '../utils/stock.js';
import { notifyLowStock } from '../utils/lowStock.js';

const router = Router();
router.use(protect);

function accessibleOrderFilter(user) {
  if (user.role === 'salesRepresentative') return { createdBy: user._id };
  if (user.role === 'warehouseManager') {
    return { warehouse: { $in: user.assignedWarehouses } };
  }
  if (user.role === 'admin') return {};
  return { _id: null };
}

router.post('/', allowRoles('salesRepresentative', 'admin'), asyncHandler(async (req, res) => {
  const { customerName, customerPhone, warehouse: warehouseId, products: items } = req.body;
  if (!customerName?.trim() || !Array.isArray(items) || !items.length) {
    const error = new Error('Customer name and at least one product are required.');
    error.status = 400;
    throw error;
  }
  if (!warehouseId || !(await Warehouse.exists({ _id: warehouseId }))) {
    const error = new Error('Choose an existing warehouse.');
    error.status = 400;
    throw error;
  }
  const lines = new Map();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || !item.product) {
      const error = new Error('Each order line must have a product and a positive whole-number quantity.');
      error.status = 400;
      throw error;
    }
    const key = String(item.product);
    lines.set(key, (lines.get(key) || 0) + quantity);
  }
  const ids = [...lines.keys()];
  const products = await Product.find({ _id: { $in: ids } });
  if (products.length !== ids.length) {
    const error = new Error('One or more selected products do not exist.');
    error.status = 400;
    throw error;
  }
  const stock = await Stock.find({ warehouse: warehouseId, product: { $in: ids } });
  const stockByProduct = new Map(stock.map((row) => [String(row.product), row.quantity]));
  for (const [productId, quantity] of lines) {
    if ((stockByProduct.get(productId) || 0) < quantity) {
      const product = products.find((entry) => String(entry._id) === productId);
      const error = new Error(`Not enough stock for ${product.name} in this warehouse.`);
      error.status = 409;
      throw error;
    }
  }
  const orderLines = products.map((product) => ({
    product: product._id,
    quantity: lines.get(String(product._id)),
    price: product.price
  }));
  const totalAmount = orderLines.reduce((total, item) => total + item.quantity * item.price, 0);
  const order = await Order.create({
    orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    customerName, customerPhone, warehouse: warehouseId, products: orderLines,
    totalAmount, createdBy: req.user._id
  });
  await audit(req.user, 'created', 'order', order._id, { orderNumber: order.orderNumber });
  res.status(201).json({ order: await order.populate('products.product warehouse createdBy') });
}));

router.get('/', asyncHandler(async (req, res) => {
  const filter = accessibleOrderFilter(req.user);
  if (req.query.status) filter.status = req.query.status;
  const orders = await Order.find(filter)
    .populate('products.product', 'name sku imageUrl')
    .populate('warehouse', 'name')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(500);
  res.json({ orders });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, ...accessibleOrderFilter(req.user) })
    .populate('products.product', 'name sku imageUrl')
    .populate('warehouse', 'name location')
    .populate('createdBy', 'name email');
  if (!order) {
    const error = new Error('Order not found.');
    error.status = 404;
    throw error;
  }
  res.json({ order });
}));

router.put('/:id/status', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Processing', 'Completed'].includes(status)) {
    const error = new Error('Orders can only be moved to Processing or Completed.');
    error.status = 400;
    throw error;
  }
  const order = await Order.findOne({ _id: req.params.id, ...accessibleOrderFilter(req.user) });
  if (!order) {
    const error = new Error('Order not found.');
    error.status = 404;
    throw error;
  }
  assertWarehouseAccess(req.user, order.warehouse);
  const expectedStatus = status === 'Processing' ? 'Pending' : 'Processing';
  if (order.status !== expectedStatus) {
    const error = new Error(`Only ${expectedStatus} orders can move to ${status}.`);
    error.status = 409;
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const changed = await Order.findOneAndUpdate(
        { _id: order._id, status: expectedStatus },
        { $set: { status } },
        { new: true, session }
      );
      if (!changed) {
        const error = new Error('This order was updated by another user. Refresh and try again.');
        error.status = 409;
        throw error;
      }
      if (status === 'Processing') {
        for (const item of order.products) {
          await changeStock({
            productId: item.product,
            warehouseId: order.warehouse,
            quantity: item.quantity,
            direction: 'out',
            performedBy: req.user._id,
            note: `Sales order ${order.orderNumber}`,
            session
          });
        }
      }
    });
  } finally {
    await session.endSession();
  }
  await audit(req.user, `order-${status.toLowerCase()}`, 'order', order._id, { orderNumber: order.orderNumber });
  const warnings = [];
  if (status === 'Processing') {
    for (const item of order.products) {
      try {
        const warning = await notifyLowStock(item.product, order.warehouse);
        if (warning) warnings.push(warning);
      } catch (error) {
        console.error('Order was processed, but a low-stock email could not be sent:', error);
        warnings.push('Order was processed, but a low-stock email could not be sent. Check SMTP settings.');
      }
    }
  }
  res.json({
    order: await Order.findById(order._id).populate('products.product warehouse createdBy'),
    ...(warnings.length ? { warning: [...new Set(warnings)].join(' ') } : {})
  });
}));

router.put('/:id/cancel', asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, status: 'Pending' };
  if (req.user.role === 'salesRepresentative') filter.createdBy = req.user._id;
  else if (req.user.role === 'warehouseManager') filter.warehouse = { $in: req.user.assignedWarehouses };
  else if (req.user.role !== 'admin') {
    const error = new Error('You cannot cancel this order.');
    error.status = 403;
    throw error;
  }
  const order = await Order.findOneAndUpdate(filter, { $set: { status: 'Cancelled' } }, { new: true });
  if (!order) {
    const error = new Error('Only a pending order you can access may be cancelled.');
    error.status = 409;
    throw error;
  }
  await audit(req.user, 'order-cancelled', 'order', order._id, { orderNumber: order.orderNumber });
  res.json({ order });
}));

export default router;
