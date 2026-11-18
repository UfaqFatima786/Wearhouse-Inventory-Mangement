import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  transactionType: {
    type: String,
    enum: ['stock-in', 'stock-out', 'transfer-in', 'transfer-out'],
    required: true
  },
  quantity: { type: Number, min: 1, required: true },
  note: { type: String, trim: true, default: '' },
  transferGroup: { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('StockTransaction', transactionSchema);
