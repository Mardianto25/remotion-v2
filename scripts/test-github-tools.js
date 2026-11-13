
import { discoverGithubTools } from '../services/composio/github-service.js';

async function main() {
  console.log('================================');
  console.log(' AI CONTENT MANAGER');
  console.log(' GITHUB TOOL DISCOVERY');
  console.log('================================');

  console.log('Repository: Mardianto25/remotion-v2');

  await discoverGithubTools();

  console.log('\nDiscovery selesai.');
}

main().catch((error) => {
  console.error('GitHub discovery gagal:', error.message);
  process.exitCode = 1;
});
