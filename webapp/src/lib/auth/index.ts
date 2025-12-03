import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';

// Auto-generate JWT secret from DATABASE_URL + AUTH_PASSWORD if not explicitly set
// This is secure because:
// 1. DATABASE_URL contains credentials unique to this deployment
// 2. AUTH_PASSWORD adds user-chosen entropy
// 3. The hash is deterministic so tokens remain valid across restarts
function getJwtSecret(): Uint8Array {
  if (process.env.JWT_SECRET) {
    return new TextEncoder().encode(process.env.JWT_SECRET);
  }

  // Generate deterministic secret from env vars
  const seed = `${process.env.DATABASE_URL || ''}:${process.env.AUTH_PASSWORD || ''}:notes-jwt-secret`;
  const hash = createHash('sha256').update(seed).digest('hex');
  return new TextEncoder().encode(hash);
}

const secret = getJwtSecret();

const COOKIE_NAME = 'notes-auth';

export async function createToken(): Promise<string> {
  return new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getAuthCookie();
  if (!token) return false;
  return verifyToken(token);
}

export function verifyPassword(password: string): boolean {
  const correctPassword = process.env.AUTH_PASSWORD;
  if (!correctPassword) {
    console.warn('AUTH_PASSWORD not set!');
    return false;
  }
  return password === correctPassword;
}
