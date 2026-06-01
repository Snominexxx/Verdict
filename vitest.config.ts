import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Verdict — test config.
 *
 * Tests target the pure, deterministic core (intent parsing, citation
 * verification). No network, no env, no Supabase. The `$lib` alias mirrors
 * SvelteKit so source-bound modules resolve the same way they do in the app.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
