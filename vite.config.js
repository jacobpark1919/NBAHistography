import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [{
      name: 'inject-env',
      transformIndexHtml() {
        return [{
          tag: 'script',
          attrs: { type: 'text/javascript' },
          children: `const SUPABASE_URL = '${env.SUPABASE_URL}'; const SUPABASE_ANON_KEY = '${env.SUPABASE_KEY}';`,
          injectTo: 'head-prepend'
        }];
      }
    }]
  };
});
