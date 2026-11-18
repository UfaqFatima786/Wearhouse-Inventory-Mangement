import Product from '../models/Product.js';
import Stock from '../models/Stock.js';
import User from '../models/User.js';
import { getMailer, isMailConfigured } from '../config/mailer.js';

export async function notifyLowStock(productId, warehouseId) {
  const product = await Product.findById(productId).select('name sku lowStockLimit');
  if (!product) return;
  const stock = await Stock.findOne({ product: productId, warehouse: warehouseId }).populate('warehouse', 'name');
  const quantity = stock?.quantity || 0;
  if (!stock) return null;
  if (quantity > product.lowStockLimit) {
    if (stock.lowStockAlerted) {
      await Stock.updateOne({ _id: stock._id }, { $set: { lowStockAlerted: false } });
    }
    return null;
  }

  const admins = await User.find({ role: 'admin', isActive: true }).select('email');
  if (!admins.length) return null;
  if (!isMailConfigured()) {
    console.warn('Low-stock alert detected, but SMTP is not configured; no email was sent.');
    return 'Low-stock email was not sent because SMTP is not configured.';
  }

  const claimed = await Stock.findOneAndUpdate(
    { _id: stock._id, lowStockAlerted: false },
    { $set: { lowStockAlerted: true } },
    { new: true }
  );
  if (!claimed) return null;
  try {
    await getMailer().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: admins.map((admin) => admin.email).join(','),
      subject: `Low stock alert: ${product.name}`,
      text: `${product.name} (${product.sku}) has ${quantity} units at ${stock.warehouse?.name || 'a warehouse'}. Low-stock limit: ${product.lowStockLimit}.`
    });
    return null;
  } catch (error) {
    await Stock.updateOne({ _id: stock._id }, { $set: { lowStockAlerted: false } });
    throw error;
  }
}
