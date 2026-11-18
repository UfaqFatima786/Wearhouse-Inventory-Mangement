import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

function issueToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
}

function publicUser(user) {
  const result = user.toObject ? user.toObject() : user;
  delete result.password;
  return result;
}

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password || password.length < 8) {
    const error = new Error('Name, email, and a password of at least 8 characters are required.');
    error.status = 400;
    throw error;
  }
  const user = await User.create({ name, email, password, phone, role: 'salesRepresentative' });
  res.status(201).json({ token: issueToken(user), user: publicUser(user) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password');
  if (!user || !user.isActive || !(await user.comparePassword(password || ''))) {
    const error = new Error('Email or password is incorrect.');
    error.status = 401;
    throw error;
  }
  res.json({ token: issueToken(user), user: publicUser(user) });
}));

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
