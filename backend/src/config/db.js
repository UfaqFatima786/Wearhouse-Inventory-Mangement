import mongoose from 'mongoose';

export default async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required. Set it in backend/.env (use the key name MONGODB_URI).');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
