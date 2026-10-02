function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, normalize(value[key])]));
  return value;
}

export function normalizeForFingerprint(value) {
  return JSON.stringify(normalize(value));
}

export async function fingerprintValue(value) {
  const bytes = new TextEncoder().encode(normalizeForFingerprint(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
