import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return resUnauthorized(next);
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-password');
    if (!user || !user.isActive) {
      const error = new Error('Your account is unavailable. Please sign in again.');
      error.status = 401;
      throw error;
    }
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.message = 'Your session has expired. Please sign in again.';
      error.status = 401;
    }
    next(error);
  }
}

function resUnauthorized(next) {
  const error = new Error('Authentication required.');
  error.status = 401;
  next(error);
}

export function allowRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      const error = new Error('You do not have permission to perform this action.');
      error.status = 403;
      return next(error);
    }
    next();
  };
}
