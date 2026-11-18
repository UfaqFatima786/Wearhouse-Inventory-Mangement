const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('warehouse-token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 403) {
    window.dispatchEvent(new CustomEvent('warehouse:access-denied', { detail: { message: body.message } }));
  }
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}

export async function uploadImage(file) {
  if (!file) return null;
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG, WebP, or GIF image under 5 MB.');
  }
  const params = new URLSearchParams({
    fileName: file.name,
    size: String(file.size),
    mimeType: file.type
  });
  const auth = await api(`/upload/auth?${params}`);
  const form = new FormData();
  form.append('file', file);
  form.append('fileName', file.name);
  form.append('publicKey', auth.publicKey);
  form.append('signature', auth.signature);
  form.append('expire', String(auth.expire));
  form.append('token', auth.token);
  form.append('useUniqueFileName', 'true');
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: form
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'ImageKit upload failed.');
  return { imageUrl: result.url, imageFileId: result.fileId };
}

export function saveSession({ token, user }) {
  localStorage.setItem('warehouse-token', token);
  localStorage.setItem('warehouse-user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('warehouse-token');
  localStorage.removeItem('warehouse-user');
}

export function readUser() {
  try {
    return JSON.parse(localStorage.getItem('warehouse-user') || 'null');
  } catch {
    return null;
  }
}
