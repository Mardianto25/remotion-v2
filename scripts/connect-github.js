
import { createComposioSession } from '../services/composio/client.js';

async function main() {
  console.log('Memeriksa koneksi GitHub Composio...');

  const session = await createComposioSession();

  console.log('User ID:', process.env.COMPOSIO_USER_ID);
  console.log('Session ID:', session.sessionId);

  const result = await session.ensureConnected('github', {
    timeout: 120000,
  });

  console.log('\n=== GITHUB CONNECTION ===');
  console.log('Toolkit:', result.toolkit);
  console.log('Already connected:', result.wasConnected);
  console.log('Account:', result.connectedAccount?.id ?? '-');
  console.log('Status:', result.connectedAccount?.status ?? '-');

  console.log('\nGitHub connection check selesai.');
}

main().catch((error) => {
  console.error('GitHub connection failed:', error.message);
  process.exitCode = 1;
});
