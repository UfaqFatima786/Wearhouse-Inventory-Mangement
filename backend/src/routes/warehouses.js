import { Router } from 'express';
import Warehouse from '../models/Warehouse.js';
import User from '../models/User.js';
import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';
import SupplyRequest from '../models/SupplyRequest.js';
import Order from '../models/Order.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { visibleWarehouseFilter } from '../utils/permissions.js';

const router = Router();
router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const warehouses = await Warehouse.find(visibleWarehouseFilter(req.user))
    .populate('manager', 'name email').sort({ name: 1 });
  res.json({ warehouses });
}));

router.post('/', allowRoles('admin'), asyncHandler(async (req, res) => {
  const { manager } = req.body;
  if (manager) {
    const user = await User.findOne({ _id: manager, role: 'warehouseManager', isActive: true });
    if (!user) {
      const error = new Error('Select an active warehouse manager.');
      error.status = 400;
      throw error;
    }
  }
  const warehouse = await Warehouse.create(req.body);
  if (manager) await User.updateOne({ _id: manager }, { $addToSet: { assignedWarehouses: warehouse._id } });
  await audit(req.user, 'created', 'warehouse', warehouse._id);
  res.status(201).json({ warehouse });
}));

router.put('/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  const previous = await Warehouse.findById(req.params.id);
  if (!previous) {
    const error = new Error('Warehouse not found.');
    error.status = 404;
    throw error;
  }
  const manager = req.body.manager || null;
  if (manager) {
    const user = await User.findOne({ _id: manager, role: 'warehouseManager', isActive: true });
    if (!user) {
      const error = new Error('Select an active warehouse manager.');
      error.status = 400;
      throw error;
    }
  }
  if (previous.manager && String(previous.manager) !== String(manager)) {
    await User.updateOne({ _id: previous.manager }, { $pull: { assignedWarehouses: previous._id } });
  }
  if (manager) await User.updateOne({ _id: manager }, { $addToSet: { assignedWarehouses: previous._id } });
  Object.assign(previous, {
    name: req.body.name ?? previous.name,
    location: req.body.location ?? previous.location,
    manager,
    capacity: req.body.capacity ?? previous.capacity
  });
  await previous.save();
  await audit(req.user, 'updated', 'warehouse', previous._id);
  res.json({ warehouse: previous });
}));

router.delete('/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) {
    const error = new Error('Warehouse not found.');
    error.status = 404;
    throw error;
  }
  const [hasStock, hasTransactions, hasOrders, hasRequests] = await Promise.all([
    Stock.exists({ warehouse: warehouse._id }),
    StockTransaction.exists({ warehouse: warehouse._id }),
    Order.exists({ warehouse: warehouse._id }),
    SupplyRequest.exists({ warehouse: warehouse._id })
  ]);
  if (hasStock || hasTransactions || hasOrders || hasRequests) {
    const error = new Error('This warehouse has inventory or order history. Keep it for audit records instead of deleting it.');
    error.status = 409;
    throw error;
  }
  if (warehouse.manager) {
    await User.updateOne({ _id: warehouse.manager }, { $pull: { assignedWarehouses: warehouse._id } });
  }
  await warehouse.deleteOne();
  await audit(req.user, 'deleted', 'warehouse', warehouse._id);
  res.json({ message: 'Warehouse deleted.' });
}));

export default router;
