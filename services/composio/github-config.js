import 'dotenv/config';

export const githubConfig = {
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  branch: process.env.GITHUB_BRANCH || 'main',
};

if (!githubConfig.owner || !githubConfig.repo) {
  throw new Error('GitHub repository belum dikonfigurasi');
}