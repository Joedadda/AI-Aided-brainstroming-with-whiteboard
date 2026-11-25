import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { customAlphabet } from 'nanoid';
import { q } from './db.ts';

export interface User {
  id: string;
  name: string;
  color: string;
}

// Author colours: dark enough that white text on them passes 4.5:1, and distinct from each other.
export const USER_COLORS = ['#2f5bd3', '#b4442c', '#1e7a4c', '#7b45b8', '#a65a12', '#0f7380', '#b03a78', '#4a5a14'];

const ADJ = ['Curious', 'Quiet', 'Bright', 'Steady', 'Swift', 'Gentle', 'Bold', 'Clever', 'Calm', 'Keen'];
const ANIMAL = ['Otter', 'Heron', 'Fox', 'Lynx', 'Owl', 'Panda', 'Wren', 'Badger', 'Seal', 'Robin'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const friendlyName = () => `${pick(ADJ)} ${pick(ANIMAL)}`;

/** Board ids are unguessable: 14 characters from a 62-letter alphabet. */
export const boardId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 14);
export const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export function createUser(name: string, wanted?: string): User & { token: string } {
  const id = newId();
  const token = randomBytes(32).toString('hex');
  const color = wanted && USER_COLORS.includes(wanted) ? wanted : pick(USER_COLORS);
  const clean = name.trim().slice(0, 40) || friendlyName();
  q.run('INSERT INTO users (id, name, color, token_hash, created_at) VALUES (?, ?, ?, ?, ?)', id, clean, color, hash(token), Date.now());
  return { id, name: clean, color, token };
}

export function userForToken(token: string | undefined | null): User | null {
  if (!token) return null;
  return q.get<User>('SELECT id, name, color FROM users WHERE token_hash = ?', hash(token)) ?? null;
}

export function updateUser(id: string, patch: { name?: string; color?: string }): User {
  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 40);
    if (clean) q.run('UPDATE users SET name = ? WHERE id = ?', clean, id);
  }
  if (patch.color && USER_COLORS.includes(patch.color)) q.run('UPDATE users SET color = ? WHERE id = ?', patch.color, id);
  return q.get<User>('SELECT id, name, color FROM users WHERE id = ?', id)!;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** Every request except POST /api/profile carries `Authorization: Bearer <token>`. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  const m = /^Bearer (.+)$/.exec(req.header('authorization') ?? '');
  const user = userForToken(m?.[1]);
  if (!user) return res.status(401).json({ error: 'Your profile was not recognised. Reload the page to make a new one.' });
  req.user = user;
  next();
}
