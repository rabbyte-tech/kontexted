import type { Command } from 'commander';
import yargs from 'yargs';

import * as initCmd from './init';
import * as startCmd from './start';
import * as stopCmd from './stop';
import * as statusCmd from './status';
import * as resetCmd from './reset';
import { registerConflictsCommand, conflictsCmd } from './conflicts';
import * as forcePullCmd from './force-pull';
import * as forcePushCmd from './force-push';

// Yargs-style exports
export const command = 'sync';
export const desc = 'Enable bidirectional sync between local files and remote workspace';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .command(initCmd)
    .command(startCmd)
    .command(stopCmd)
    .command(statusCmd)
    .command(resetCmd)
    .command(conflictsCmd)
    .command(forcePullCmd)
    .command(forcePushCmd)
    .demandCommand()
    .help();
};

export const handler = () => {};

// ============ Register with Commander ============

/**
 * Register the sync command and all its subcommands with the Commander program.
 * This enables the CLI to use: kontexted sync <subcommand>
 */
export function registerSyncCommand(program: Command): void {
  const syncCmd = program
    .command('sync')
    .description('Enable bidirectional sync between local files and remote workspace');

  // init
  syncCmd
    .command('init')
    .description(initCmd.desc)
    .option('-a, --alias <alias>', 'Alias for the workspace to sync with')
    .option('-w, --workspace <slug>', 'Workspace slug to sync with')
    .option('-d, --dir <directory>', 'Directory to sync (default: current directory)')
    .action(async (opts) => {
      const args: string[] = ['init'];
      if (opts.alias) args.push('--alias', opts.alias);
      if (opts.workspace) args.push('--workspace', opts.workspace);
      if (opts.dir) args.push('--dir', opts.dir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./init').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // start
  syncCmd
    .command('start')
    .description(startCmd.desc)
    .option('-d, --daemon', 'Run sync daemon in background')
    .option('-f, --foreground', 'Run sync daemon in foreground (blocking)')
    .option('--dir <directory>', 'Sync directory (default: .kontexted in current directory)')
    .option('-l, --log', 'Tail daemon log file')
    .action(async (opts) => {
      const args: string[] = ['start'];
      if (opts.daemon) args.push('--daemon');
      if (opts.foreground) args.push('--foreground');
      if (opts.dir) args.push('--dir', opts.dir);
      if (opts.log) args.push('--log');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./start').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // stop
  syncCmd
    .command('stop')
    .description(stopCmd.desc)
    .option('--force', 'Force kill the sync daemon (SIGKILL)')
    .action(async (opts) => {
      const args: string[] = ['stop'];
      if (opts.force) args.push('--force');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./stop').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // status
  syncCmd
    .command('status')
    .description(statusCmd.desc)
    .option('-j, --json', 'Output status as JSON')
    .option('--dir <directory>', 'Sync directory (default: .kontexted in current directory)')
    .action(async (opts) => {
      const args: string[] = ['status'];
      if (opts.json) args.push('--json');
      if (opts.dir) args.push('--dir', opts.dir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./status').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // reset
  syncCmd
    .command('reset')
    .description(resetCmd.desc)
    .option('--clean', 'Delete entire .kontexted/ directory (not just state)')
    .option('-f, --force', 'Skip confirmation prompt')
    .option('--dir <directory>', 'Sync directory (default: .kontexted in current directory)')
    .action(async (opts) => {
      const args: string[] = ['reset'];
      if (opts.clean) args.push('--clean');
      if (opts.force) args.push('--force');
      if (opts.dir) args.push('--dir', opts.dir);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./reset').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // conflicts - uses nested Commander subcommands
  registerConflictsCommand(syncCmd);

  // force-pull
  syncCmd
    .command('force-pull')
    .description(forcePullCmd.desc)
    .option('-f, --force', 'Force overwrite without confirmation')
    .option('--dir <directory>', 'Sync directory (default: .kontexted in current directory)')
    .option('--alias <alias>', 'Profile alias to use')
    .action(async (opts) => {
      const args: string[] = ['force-pull'];
      if (opts.force) args.push('--force');
      if (opts.dir) args.push('--dir', opts.dir);
      if (opts.alias) args.push('--alias', opts.alias);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./force-pull').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });

  // force-push
  syncCmd
    .command('force-push')
    .description(forcePushCmd.desc)
    .option('-f, --force', 'Force overwrite without confirmation')
    .option('--dir <directory>', 'Sync directory (default: .kontexted in current directory)')
    .option('--alias <alias>', 'Profile alias to use')
    .action(async (opts) => {
      const args: string[] = ['force-push'];
      if (opts.force) args.push('--force');
      if (opts.dir) args.push('--dir', opts.dir);
      if (opts.alias) args.push('--alias', opts.alias);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await import('./force-push').then((mod) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yargs(args)
          .command(mod as any)
          .parse()
      );
    });
}
