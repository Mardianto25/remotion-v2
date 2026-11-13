
import { createComposioSession } from './client.js';
import { githubConfig } from './github-config.js';

export async function discoverGithubTools() {
  const session = await createComposioSession();

  console.log('Mencari GitHub tools...');

  const result = await session.search({
    query: `Get repository details, list GitHub Actions workflows,
    inspect workflow runs and list recent commits for repository
    ${githubConfig.owner}/${githubConfig.repo}`,
    toolkits: ['github'],
  });

  console.log('\n=== GITHUB TOOLS ===');
  console.log(JSON.stringify(result, null, 2));

  return result;
}
