import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import connectDB from './src/config/db.js';

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });

const { default: app } = await import('./src/app.js');
const port = Number(process.env.PORT) || 5000;

await connectDB();
const server = app.listen(port, () => {
  console.log(`Warehouse API listening on http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other service or set PORT to a free port in backend/.env.`);
    void mongoose.disconnect().then(
      () => { process.exitCode = 1; },
      (disconnectError) => { console.error('MongoDB disconnect failed:', disconnectError.message); process.exitCode = 1; }
    );
    return;
  }
  console.error('HTTP server failed to start:', error);
  void mongoose.disconnect().then(
    () => { process.exitCode = 1; },
    (disconnectError) => { console.error('MongoDB disconnect failed:', disconnectError.message); process.exitCode = 1; }
  );
});
