import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
  category: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  lowStockLimit: { type: Number, required: true, min: 0, default: 5 },
  imageUrl: { type: String, default: '' },
  imageFileId: { type: String, default: '' },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

productSchema.index({ name: 'text', sku: 'text', category: 'text' });
export default mongoose.model('Product', productSchema);
