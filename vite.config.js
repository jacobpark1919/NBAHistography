import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = env.SUPABASE_KEY || process.env.SUPABASE_KEY || '';
  if (!url || !key) {
    console.warn('[vite] SUPABASE_URL / SUPABASE_KEY not set — data will not load');
  }
  return {
    plugins: [{
      name: 'inject-env',
      transformIndexHtml() {
        return [{
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `const SUPABASE_URL = '${url}'; const SUPABASE_ANON_KEY = '${key}';`,
          injectTo: 'head-prepend'
        }];
      }
    }]
  };
});
