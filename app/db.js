// The only place that creates the Supabase client (engineering-constitution.md §3).
// supabase-js is vendored as a classic script that sets globalThis.supabase. It is only loaded
// when this host has a database, so pages without one stay light.
import { loadConfig } from './config.js';

const VENDOR = new URL('../vendor/supabase-js-2.118.0.js', import.meta.url);

function loadVendor() {
  if (globalThis.supabase?.createClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VENDOR.href;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('supabase-js failed to load'));
    document.head.append(script);
  });
}

let clientPromise;

// Resolves to the client, or to null when there is no database for this host.
export function getClient() {
  if (!clientPromise) clientPromise = createClient();
  return clientPromise;
}

async function createClient() {
  const config = await loadConfig();
  if (!config) return null;
  await loadVendor();
  return globalThis.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
}
