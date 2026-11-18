import { Router } from 'express';
import User from '../models/User.js';
import Warehouse from '../models/Warehouse.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import SupplyRequest from '../models/SupplyRequest.js';
import StockTransaction from '../models/StockTransaction.js';
import { protect, allowRoles } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import audit from '../utils/audit.js';
import { verifyImageKitUpload } from '../utils/permissions.js';
import { deleteImageKitFile } from '../config/imagekit.js';

const router = Router();
router.use(protect);

router.get('/', allowRoles('admin'), asyncHandler(async (_req, res) => {
  const users = await User.find().select('-password').populate('assignedWarehouses', 'name');
  res.json({ users });
}));

router.post('/', allowRoles('admin'), asyncHandler(async (req, res) => {
  const { name, email, password, phone, role, assignedWarehouses } = req.body;
  if (!['admin', 'warehouseManager', 'supplier', 'salesRepresentative'].includes(role)) {
    const error = new Error('Choose a valid user role.');
    error.status = 400;
    throw error;
  }
  if (role === 'warehouseManager' && assignedWarehouses?.length) {
    const count = await Warehouse.countDocuments({ _id: { $in: assignedWarehouses } });
    if (count !== assignedWarehouses.length) {
      const error = new Error('One or more assigned warehouses do not exist.');
      error.status = 400;
      throw error;
    }
  }
  if (req.body.image !== undefined || req.body.imageFileId !== undefined) {
    await verifyImageKitUpload(req.body.image, req.body.imageFileId);
  }
  const assignments = role === 'warehouseManager' ? assignedWarehouses || [] : [];
  const user = await User.create({
    name, email, password, phone, role, assignedWarehouses: assignments,
    image: req.body.image || '', imageFileId: req.body.imageFileId || ''
  });
  if (role === 'warehouseManager' && assignments.length) {
    await Warehouse.updateMany({ _id: { $in: assignments } }, { $set: { manager: user._id } });
  }
  await audit(req.user, 'created', 'user', user._id, { role: user.role });
  res.status(201).json({ user: await User.findById(user._id).select('-password') });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const isSelf = String(req.user._id) === req.params.id;
  if (req.user.role !== 'admin' && !(isSelf && req.user.role === 'supplier')) {
    const error = new Error('You cannot update this account.');
    error.status = 403;
    throw error;
  }
  const allowed = req.user.role === 'admin'
    ? ['name', 'email', 'phone', 'role', 'assignedWarehouses', 'isActive', 'image', 'imageFileId']
    : ['name', 'phone', 'image', 'imageFileId'];
  const updates = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => allowed.includes(key))
  );
  if (updates.image !== undefined || updates.imageFileId !== undefined) {
    await verifyImageKitUpload(updates.image, updates.imageFileId);
  }
  if (updates.role && !['admin', 'warehouseManager', 'supplier', 'salesRepresentative'].includes(updates.role)) {
    const error = new Error('Choose a valid user role.');
    error.status = 400;
    throw error;
  }
  if (updates.role && updates.role !== 'warehouseManager') updates.assignedWarehouses = [];
  if (updates.role === 'warehouseManager' && updates.assignedWarehouses?.length) {
    const count = await Warehouse.countDocuments({ _id: { $in: updates.assignedWarehouses } });
    if (count !== updates.assignedWarehouses.length) {
      const error = new Error('One or more assigned warehouses do not exist.');
      error.status = 400;
      throw error;
    }
  }
  const account = await User.findById(req.params.id);
  if (!account) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }
  const previousImageFileId = account.imageFileId;
  const previousRole = account.role;
  const previousAssignments = account.assignedWarehouses.map(String);
  Object.assign(account, updates);
  if (req.body.password && req.user.role === 'admin') account.password = req.body.password;
  await account.save();
  if (previousRole === 'warehouseManager' && account.role !== 'warehouseManager') {
    await Warehouse.updateMany({ manager: account._id }, { $set: { manager: null } });
  } else if (account.role === 'warehouseManager' && updates.assignedWarehouses) {
    await Warehouse.updateMany(
      { manager: account._id, _id: { $nin: account.assignedWarehouses } },
      { $set: { manager: null } }
    );
    for (const warehouseId of account.assignedWarehouses) {
      await Warehouse.updateOne({ _id: warehouseId }, { $set: { manager: account._id } });
    }
  }
  if (previousImageFileId && updates.imageFileId && previousImageFileId !== updates.imageFileId) {
    await deleteImageKitFile(previousImageFileId);
  }
  const user = await User.findById(account._id).select('-password');
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }
  await audit(req.user, 'updated', 'user', user._id, {
    fields: Object.keys(updates),
    previousAssignedWarehouses: previousAssignments
  });
  res.json({ user });
}));

router.delete('/:id', allowRoles('admin'), asyncHandler(async (req, res) => {
  if (String(req.user._id) === req.params.id) {
    const error = new Error('You cannot delete your own admin account.');
    error.status = 400;
    throw error;
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }
  const [hasProducts, hasOrders, hasRequests, hasTransactions, managesWarehouse] = await Promise.all([
    Product.exists({ $or: [{ supplier: user._id }, { createdBy: user._id }] }),
    Order.exists({ createdBy: user._id }),
    SupplyRequest.exists({ supplier: user._id }),
    StockTransaction.exists({ performedBy: user._id }),
    Warehouse.exists({ manager: user._id })
  ]);
  if (hasProducts || hasOrders || hasRequests || hasTransactions || managesWarehouse) {
    const error = new Error('This account is linked to workspace records. Deactivate it instead of deleting it.');
    error.status = 409;
    throw error;
  }
  await user.deleteOne();
  if (user.role === 'warehouseManager') {
    await Warehouse.updateMany({ manager: user._id }, { $set: { manager: null } });
  }
  await audit(req.user, 'deleted', 'user', user._id, { role: user.role });
  res.json({ message: 'User deleted.' });
}));

router.get('/activity', allowRoles('admin'), asyncHandler(async (req, res) => {
  const ActivityLog = (await import('../models/ActivityLog.js')).default;
  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 100, 500));
  res.json({ activity: logs });
}));

export default router;
