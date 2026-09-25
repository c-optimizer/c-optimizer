const { ipcMain } = require('electron');
const https = require('https');
const { log } = require('../utils/logger');

let cachedChangelog = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

function fetchGithubReleases() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/c-optimizer/c-optimizer/releases?per_page=5',
      headers: { 'User-Agent': 'C-Optimizer-App' }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API retornou ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function registerChangelogHandlers() {
  ipcMain.handle('system:get-changelog', async () => {
    const now = Date.now();
    if (cachedChangelog && now - cachedAt < CACHE_TTL_MS) {
      return { success: true, releases: cachedChangelog };
    }

    try {
      const raw = await fetchGithubReleases();
      const releases = raw.map((r) => ({
        version: r.tag_name,
        name: r.name || r.tag_name,
        publishedAt: r.published_at,
        notes: r.body || ''
      }));
      cachedChangelog = releases;
      cachedAt = now;
      return { success: true, releases };
    } catch (error) {
      log.error('[system:get-changelog] Erro:', error.message);
      return { success: false, error: 'Não foi possível carregar as notas de atualização.' };
    }
  });
}

module.exports = { registerChangelogHandlers };