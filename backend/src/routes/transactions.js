import { Router } from 'express';
import StockTransaction from '../models/StockTransaction.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { assertWarehouseAccess, visibleWarehouseFilter } from '../utils/permissions.js';

const router = Router();
router.use(protect);

router.get('/', allowRoles('admin', 'warehouseManager'), asyncHandler(async (req, res) => {
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

export default router;
