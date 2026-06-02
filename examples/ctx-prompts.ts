import { defineCLI, defineMenuItem, run } from '../src/define-cli.js';

// Demonstrates the v0.3 ctx prompts: text / select / multiselect / isCancel.
// These run through vereda's own clack instance, so theme messages/keyAliases
// carry over, and you don't import @clack/prompts directly in your action.
const config = defineCLI({
  name: 'ctx-prompts',
  menu: [
    defineMenuItem({
      label: 'New project',
      command: 'new',
      action: async (ctx) => {
        const name = await ctx.text({
          message: 'Project name?',
          placeholder: 'my-app',
          validate: (v) => (v.length < 2 ? 'At least 2 characters.' : undefined),
        });
        if (ctx.isCancel(name)) {
          ctx.log.warn('Cancelled.');
          return;
        }

        const lang = await ctx.select({
          message: 'Language',
          options: [
            { value: 'ts', label: 'TypeScript', hint: 'recommended' },
            { value: 'js', label: 'JavaScript' },
          ],
        });
        if (ctx.isCancel(lang)) return;

        const features = await ctx.multiselect({
          message: 'Features',
          options: [
            { value: 'eslint', label: 'ESLint' },
            { value: 'vitest', label: 'Vitest' },
            { value: 'ci', label: 'GitHub Actions' },
          ],
          required: false,
        });
        if (ctx.isCancel(features)) return;

        ctx.log.info(`Creating ${name} (${lang}) with: ${features.join(', ') || 'no extras'}`);
      },
    }),
  ],
});

const exitCode = await run(config, process.argv.slice(2));
process.exit(exitCode);
