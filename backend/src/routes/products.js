import { Router } from 'express';
import Product from '../models/Product.js';
import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';
import SupplyRequest from '../models/SupplyRequest.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { assertWarehouseAccess, verifyImageKitUpload } from '../utils/permissions.js';
import { deleteImageKitFile } from '../config/imagekit.js';

const router = Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const { q, category, supplier, warehouse, availability } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (req.user.role === 'supplier') filter.supplier = req.user._id;
  else if (supplier) filter.supplier = supplier;
  if (warehouse) assertWarehouseAccess(req.user, warehouse);
  const escapedQuery = String(q || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (escapedQuery) filter.$or = [
    { name: { $regex: escapedQuery, $options: 'i' } },
    { sku: { $regex: escapedQuery, $options: 'i' } },
    { category: { $regex: escapedQuery, $options: 'i' } }
  ];

  if (availability || warehouse) {
    const stockFilter = {};
    if (warehouse) stockFilter.warehouse = warehouse;
    else if (req.user.role === 'warehouseManager') {
      stockFilter.warehouse = { $in: req.user.assignedWarehouses };
    }
    if (availability === 'inStock') stockFilter.quantity = { $gt: 0 };
    if (availability === 'outOfStock') stockFilter.quantity = 0;
    if (availability === 'low') {
      const lowIds = await Stock.aggregate([
        { $match: stockFilter },
        { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'productDoc' } },
        { $unwind: '$productDoc' },
        { $match: { $expr: { $lte: ['$quantity', '$productDoc.lowStockLimit'] } } },
        { $group: { _id: '$product' } }
      ]);
      filter._id = { $in: lowIds.map((item) => item._id) };
    } else {
      const stockIds = await Stock.distinct('product', stockFilter);
      filter._id = { $in: stockIds };
    }
  }

  const products = await Product.find(filter)
    .populate('supplier', 'name email')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  const productIds = products.map((product) => product._id);
  const stockFilter = { product: { $in: productIds } };
  if (warehouse) stockFilter.warehouse = warehouse;
  else if (req.user.role === 'warehouseManager') {
    stockFilter.warehouse = { $in: req.user.assignedWarehouses };
  }
  const stock = await Stock.find(stockFilter).populate('warehouse', 'name').lean();
  const stockByProduct = new Map();
  for (const row of stock) {
    const key = String(row.product);
    stockByProduct.set(key, (stockByProduct.get(key) || 0) + row.quantity);
  }
  res.json({
    products: products.map((product) => ({
      ...product,
      available: stockByProduct.get(String(product._id)) || 0,
      warehouseStock: stock.filter((row) => String(row.product) === String(product._id))
    }))
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role === 'supplier') filter.supplier = req.user._id;
  const product = await Product.findOne(filter).populate('supplier', 'name email');
  if (!product) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }
  res.json({ product });
}));

router.post('/', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  await verifyImageKitUpload(req.body.imageUrl, req.body.imageFileId);
  if (req.body.supplier && !(await User.exists({ _id: req.body.supplier, role: 'supplier' }))) {
    const error = new Error('Choose a valid supplier account.');
    error.status = 400;
    throw error;
  }
  const product = await Product.create({ ...req.body, createdBy: req.user._id });
  await audit(req.user, 'created', 'product', product._id, { sku: product.sku });
  res.status(201).json({ product });
}));

router.put('/:id', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
  if (req.body.imageUrl !== undefined || req.body.imageFileId !== undefined) {
    await verifyImageKitUpload(req.body.imageUrl, req.body.imageFileId);
  }
  const product = await Product.findById(req.params.id);
  if (!product) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }
  const oldFileId = product.imageFileId;
  const updates = ['name', 'description', 'sku', 'category', 'price', 'lowStockLimit', 'imageUrl', 'imageFileId', 'supplier']
    .filter((key) => req.body[key] !== undefined)
    .reduce((data, key) => ({ ...data, [key]: req.body[key] }), {});
  if (updates.supplier && !(await User.exists({ _id: updates.supplier, role: 'supplier' }))) {
    const error = new Error('Choose a valid supplier account.');
    error.status = 400;
    throw error;
  }
  Object.assign(product, updates);
  await product.save();
  if (oldFileId && updates.imageFileId && oldFileId !== updates.imageFileId) {
    await deleteImageKitFile(oldFileId);
  }
  await audit(req.user, 'updated', 'product', product._id, { fields: Object.keys(updates) });
  res.json({ product });
}));

router.delete('/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }
  const [hasStock, hasTransactions, hasOrders, hasRequests] = await Promise.all([
    Stock.exists({ product: product._id }),
    StockTransaction.exists({ product: product._id }),
    Order.exists({ 'products.product': product._id }),
    SupplyRequest.exists({ product: product._id })
  ]);
  if (hasStock || hasTransactions || hasOrders || hasRequests) {
    const error = new Error('This product has inventory history. Keep it for audit records instead of deleting it.');
    error.status = 409;
    throw error;
  }
  if (product.imageFileId) await deleteImageKitFile(product.imageFileId);
  await product.deleteOne();
  await audit(req.user, 'deleted', 'product', product._id, { sku: product.sku });
  res.json({ message: 'Product deleted.' });
}));

export default router;
