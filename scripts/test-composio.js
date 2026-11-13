
import { createComposioSession } from '../services/composio/client.js';

async function main() {
  console.log('Menghubungkan ke Composio...');

  const session = await createComposioSession();

  console.log('Session berhasil dibuat.');

  const tools = await session.tools();

  console.log('Tools berhasil diambil.');

  if (Array.isArray(tools)) {
    console.log('Jumlah tools:', tools.length);
  } else {
    console.log('Struktur tools:', Object.keys(tools));
  }

  console.log('Composio integration: READY');
}

main().catch((error) => {
  console.error('Composio connection failed:', error.message);
  process.exitCode = 1;
});
