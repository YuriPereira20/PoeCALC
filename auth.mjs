import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const hex = (s) => (/^([0-9a-f]{2})+$/.test(s) ? Buffer.from(s, 'hex') : null);
const mac = (s, secret) => createHmac('sha256', secret).update(s).digest('hex');

export const hashPassword = async (pw) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
};

export const verifyPassword = async (pw, stored) => {
  const [alg, salt, hash] = String(stored).split('$');
  const s = hex(salt), h = hex(hash);
  if (alg !== 'scrypt' || !s || !h) return false;
  return timingSafeEqual(await scryptAsync(pw, s, h.length), h);
};

// token: base64url(user).expiryMs.hmac-sha256 of those two parts
export const sign = (user, secret, ttlMs) => {
  const body = `${Buffer.from(user).toString('base64url')}.${Date.now() + ttlMs}`;
  return `${body}.${mac(body, secret)}`;
};

export const verify = (token, secret) => {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [b64, exp, sig] = parts;
  const want = Buffer.from(mac(`${b64}.${exp}`, secret)), got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want) || !(Date.now() < Number(exp))) return null;
  return Buffer.from(b64, 'base64url').toString();
};
