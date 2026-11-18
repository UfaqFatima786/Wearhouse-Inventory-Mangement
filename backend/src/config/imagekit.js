import ImageKit from '@imagekit/nodejs';

const imagekit = process.env.IMAGEKIT_PRIVATE_KEY
  ? new ImageKit({ privateKey: process.env.IMAGEKIT_PRIVATE_KEY })
  : null;

export function requireImageKit() {
  if (!imagekit || !process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
    const error = new Error('ImageKit is not configured. Set its keys in backend/.env.');
    error.status = 503;
    throw error;
  }
  return imagekit;
}

function imageKitAuthorization() {
  if (!process.env.IMAGEKIT_PRIVATE_KEY) throw new Error('IMAGEKIT_PRIVATE_KEY is not configured.');
  return `Basic ${Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString('base64')}`;
}

export async function getImageKitFile(fileId) {
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: imageKitAuthorization() }
  });
  if (!response.ok) {
    const error = new Error(`ImageKit could not verify the uploaded file (HTTP ${response.status}).`);
    error.status = response.status === 404 ? 400 : 502;
    throw error;
  }
  return response.json();
}

export async function deleteImageKitFile(fileId) {
  const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: imageKitAuthorization() }
  });
  if (!response.ok) {
    const error = new Error(`ImageKit could not delete the file (HTTP ${response.status}).`);
    error.status = 502;
    throw error;
  }
}

export default imagekit;
