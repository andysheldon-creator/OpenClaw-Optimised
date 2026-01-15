import { readFileSync } from 'node:fs';
import { loadInternalHooks } from './dist/hooks/loader.js';

// Load config
const configPath = process.env.HOME + '/.clawdbot/clawdbot.json';
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

console.log('Config hooks:', JSON.stringify(config.hooks, null, 2));
console.log('\nLoading hooks...');

const count = await loadInternalHooks(config);
console.log(`\nLoaded ${count} internal hook handlers`);
