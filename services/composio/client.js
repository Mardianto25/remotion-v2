
import 'dotenv/config';
import { Composio } from '@composio/core';

const apiKey = process.env.COMPOSIO_API_KEY;
const userId = process.env.COMPOSIO_USER_ID;

if (!apiKey) {
  throw new Error('COMPOSIO_API_KEY belum dikonfigurasi');
}

if (!userId) {
  throw new Error('COMPOSIO_USER_ID belum dikonfigurasi');
}

// Satu instance untuk digunakan bersama
export const composio = new Composio({
  apiKey,
});

export const composioUserId = userId;

// Membuat session untuk user AI Content Manager
export async function createComposioSession() {
  const session = await composio.sessions.create(userId);

  return session;
}
