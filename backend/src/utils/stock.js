import Stock from '../models/Stock.js';
import StockTransaction from '../models/StockTransaction.js';

export async function changeStock({
  productId,
  warehouseId,
  quantity,
  direction,
  performedBy,
  note,
  session
}) {
  const increment = direction === 'in' ? quantity : -quantity;
  if (direction === 'in') {
    await Stock.findOneAndUpdate(
      { product: productId, warehouse: warehouseId },
      { $inc: { quantity: increment } },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
  } else {
    const updated = await Stock.findOneAndUpdate(
      { product: productId, warehouse: warehouseId, quantity: { $gte: quantity } },
      { $inc: { quantity: increment } },
      { new: true, session }
    );
    if (!updated) {
      const error = new Error('Insufficient stock available for this operation.');
      error.status = 409;
      throw error;
    }
  }

  const transaction = await StockTransaction.create(
    [{
      product: productId,
      warehouse: warehouseId,
      transactionType: direction === 'in' ? 'stock-in' : 'stock-out',
      quantity,
      note,
      performedBy
    }],
    { session }
  );
  return transaction[0];
}

export async function runInventoryTransaction(work) {
  const mongoose = (await import('mongoose')).default;
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
