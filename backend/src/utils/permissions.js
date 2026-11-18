import { getImageKitFile } from '../config/imagekit.js';

export function canAccessWarehouse(user, warehouseId) {
  return user.role === 'admin' ||
    (user.role === 'warehouseManager' &&
      user.assignedWarehouses.some((id) => String(id) === String(warehouseId)));
}

export function visibleWarehouseFilter(user) {
  return user.role === 'warehouseManager'
    ? { _id: { $in: user.assignedWarehouses } }
    : {};
}

export function assertWarehouseAccess(user, warehouseId) {
  if (!canAccessWarehouse(user, warehouseId)) {
    const error = new Error('You do not have access to this warehouse.');
    error.status = 403;
    throw error;
  }
}

export function assertImageKitUrl(url) {
  if (!url) return;
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!endpoint || !url.startsWith(`${endpoint.replace(/\/$/, '')}/`)) {
    const error = new Error('Images must be uploaded through the configured ImageKit account.');
    error.status = 400;
    throw error;
  }
}

export async function verifyImageKitUpload(url, fileId) {
  if (!url && !fileId) return;
  assertImageKitUrl(url);
  if (!url || !fileId) {
    const error = new Error('Provide both the ImageKit image URL and file ID returned by an upload.');
    error.status = 400;
    throw error;
  }
  const uploaded = await getImageKitFile(fileId);
  if (uploaded.url !== url || uploaded.fileType !== 'image' || uploaded.size > 5 * 1024 * 1024) {
    const error = new Error('The image does not match a valid ImageKit upload.');
    error.status = 400;
    throw error;
  }
}
