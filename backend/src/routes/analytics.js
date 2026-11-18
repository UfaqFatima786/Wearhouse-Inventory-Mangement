import { Router } from 'express';
import Order from '../models/Order.js';
import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Warehouse from '../models/Warehouse.js';
import SupplyRequest from '../models/SupplyRequest.js';
import ActivityLog from '../models/ActivityLog.js';
import { protect } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { visibleWarehouseFilter } from '../utils/permissions.js';

const router = Router();
router.use(protect);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const warehouseFilter = visibleWarehouseFilter(req.user);
  const warehouseIds = req.user.role === 'warehouseManager'
    ? req.user.assignedWarehouses
    : null;
  const supplierProductIds = req.user.role === 'supplier'
    ? await Product.distinct('_id', { supplier: req.user._id })
    : null;
  const orderFilter = ['salesRepresentative', 'supplier'].includes(req.user.role)
    ? (req.user.role === 'salesRepresentative' ? { createdBy: req.user._id } : { _id: null })
    : warehouseIds ? { warehouse: { $in: warehouseIds } } : {};
  const stockFilter = {
    ...(warehouseFilter._id ? { warehouse: warehouseFilter._id } : {}),
    ...(supplierProductIds ? { product: { $in: supplierProductIds } } : {})
  };
  const [
    users, products, warehouses, suppliers, totalOrders, pendingOrders,
    transactions, stock, supplyRequests, activity, sales, monthlyStockMovement, topProducts
  ] = await Promise.all([
    req.user.role === 'admin' ? User.countDocuments() : Promise.resolve(null),
    Product.countDocuments(supplierProductIds ? { supplier: req.user._id } : {}),
    Warehouse.countDocuments(warehouseFilter),
    req.user.role === 'admin' ? User.countDocuments({ role: 'supplier' }) : Promise.resolve(null),
    Order.countDocuments(orderFilter),
    Order.countDocuments({ ...orderFilter, status: 'Pending' }),
    StockTransaction.countDocuments(warehouseIds ? { warehouse: { $in: warehouseIds } } : {}),
    Stock.find(stockFilter).populate('product', 'name sku lowStockLimit').lean(),
    req.user.role === 'supplier'
      ? SupplyRequest.countDocuments({ supplier: req.user._id, status: 'Pending' })
      : Promise.resolve(null),
    req.user.role === 'admin'
      ? ActivityLog.find().sort({ createdAt: -1 }).limit(8).lean()
      : Promise.resolve([]),
    Order.aggregate([
      { $match: { ...orderFilter, status: 'Completed', createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
      { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    StockTransaction.aggregate([
      ...(warehouseIds ? [{ $match: { warehouse: { $in: warehouseIds } } }] : []),
      ...(supplierProductIds ? [{ $match: { product: { $in: supplierProductIds } } }] : []),
      { $match: { date: { $gte: new Date(new Date().getFullYear(), 0, 1) } } },
      { $group: {
        _id: { month: { $month: '$date' }, type: '$transactionType' },
        quantity: { $sum: '$quantity' }
      } },
      { $sort: { '_id.month': 1 } }
    ]),
    Order.aggregate([
      { $match: { ...orderFilter, status: 'Completed' } },
      { $unwind: '$products' },
      { $group: { _id: '$products.product', units: { $sum: '$products.quantity' }, revenue: { $sum: { $multiply: ['$products.quantity', '$products.price'] } } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { name: '$product.name', sku: '$product.sku', units: 1, revenue: 1 } }
    ])
  ]);
  const lowStock = stock.filter((row) => row.product && row.quantity <= row.product.lowStockLimit);
  res.json({
    stats: {
      users, products, warehouses, suppliers, orders: totalOrders,
      pendingOrders, lowStock: lowStock.length, transactions, supplyRequests
    },
    charts: { sales, stockMovement: monthlyStockMovement, topProducts },
    lowStockItems: lowStock.slice(0, 20),
    activity
  });
}));

export default router;
