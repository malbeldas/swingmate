// Writes app/config.local.json from `supabase status` so the web and the E2E tests talk to the
// local Supabase (infrastructure.md §1). The file is git-ignored; run `npm run local:config`
// after `supabase start`.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const bin = process.env.SUPABASE_BIN || 'supabase';
const status = JSON.parse(execFileSync(bin, ['status', '-o', 'json'], { encoding: 'utf8' }));
const config = {
  url: status.API_URL,
  anonKey: status.ANON_KEY || status.PUBLISHABLE_KEY,
  mailpitUrl: status.MAILPIT_URL || status.INBUCKET_URL || 'http://127.0.0.1:54324',
};
if (!config.url || !config.anonKey) throw new Error('supabase status did not return API_URL and ANON_KEY');
writeFileSync(new URL('../app/config.local.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
console.log(`app/config.local.json -> ${config.url}`);
