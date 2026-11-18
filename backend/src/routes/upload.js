import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';
import { requireImageKit } from '../config/imagekit.js';

const router = Router();
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

router.get('/auth', protect, asyncHandler(async (req, res) => {
  const size = Number(req.query.size);
  const mimeType = String(req.query.mimeType || '').toLowerCase();
  const fileName = String(req.query.fileName || '');
  if (!allowedTypes.has(mimeType) || !Number.isInteger(size) || size <= 0 || size > 5 * 1024 * 1024) {
    const error = new Error('Upload must be a JPEG, PNG, WebP, or GIF image no larger than 5 MB.');
    error.status = 400;
    throw error;
  }
  if (!fileName || fileName.length > 200) {
    const error = new Error('A valid image file name is required.');
    error.status = 400;
    throw error;
  }
  const imagekit = requireImageKit();
  res.json({
    ...imagekit.helper.getAuthenticationParameters(),
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
}));

export default router;
