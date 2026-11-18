import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import connectDB from './config/db.js';
import User from './models/User.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

await connectDB();
const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = process.env;
if (!BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error('Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in backend/.env.');
}

const email = BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
const existing = await User.findOne({ email });
if (existing) {
  if (existing.role !== 'admin') throw new Error(`The configured bootstrap email already belongs to a non-admin account: ${email}`);
  console.log(`Admin account already exists: ${email}`);
} else {
  await User.create({
    name: BOOTSTRAP_ADMIN_NAME || 'Warehouse Admin',
    email,
    password: BOOTSTRAP_ADMIN_PASSWORD,
    role: 'admin'
  });
  console.log(`Admin account created: ${email}`);
}
process.exit(0);
