import type { Command } from 'commander';
import yargs from 'yargs';
import * as initCmd from './init';
import * as startCmd from './start';
import * as stopCmd from './stop';
import * as statusCmd from './status';
import * as logsCmd from './logs';
import * as doctorCmd from './doctor';
import * as migrateCmd from './migrate';
import * as showInviteCmd from './show-invite';

// Yargs-style exports (as requested by user)
export const command = 'server';
export const desc = 'Manage Kontexted server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .command(initCmd)
    .command(startCmd)
    .command(stopCmd)
    .command(statusCmd)
    .command(logsCmd)
    .command(doctorCmd)
    .command(migrateCmd)
    .command(showInviteCmd)
    .demandCommand()
    .help();
};

export const handler = () => {};

// ============ Register with Commander ============

export function registerServerCommand(program: Command): void {
  const serverCmd = program.command('server').description('Manage Kontexted server');

  // init
  serverCmd
    .command('init')
    .description(initCmd.desc)
    .option('-i, --interactive', 'Interactive mode to customize configuration')
    .action(async (opts) => {
      const args = opts.interactive ? ['init', '--interactive'] : ['init'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(args)
        .command(initCmd as any)
        .option('interactive', { type: 'boolean', default: false })
        .parse();
    });

  // start
  serverCmd
    .command('start')
    .description(startCmd.desc)
    .option('-f, --foreground', 'Run server in foreground (blocking)')
    .action(async (opts) => {
      const args = opts.foreground ? ['start', '--foreground'] : ['start'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(args)
        .command(startCmd as any)
        .parse();
    });

  // stop
  serverCmd
    .command('stop')
    .description(stopCmd.desc)
    .option('--force', 'Force kill the server (SIGKILL)')
    .action(async (opts) => {
      const args = opts.force ? ['stop', '--force'] : ['stop'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(args)
        .command(stopCmd as any)
        .parse();
    });

  // status
  serverCmd
    .command('status')
    .description(statusCmd.desc)
    .action(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(['status'])
        .command(statusCmd as any)
        .parse();
    });

  // logs
  serverCmd
    .command('logs')
    .description(logsCmd.desc)
    .option('-f, --follow', 'Follow log output in real-time')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .action(async (opts) => {
      const args = ['logs'];
      if (opts.follow) args.push('--follow');
      if (opts.lines) args.push('--lines', opts.lines.toString());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(args)
        .command(logsCmd as any)
        .parse();
    });

  // doctor
  serverCmd
    .command('doctor')
    .description(doctorCmd.desc)
    .action(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(['doctor'])
        .command(doctorCmd as any)
        .parse();
    });

  // migrate
  serverCmd
    .command('migrate')
    .description(migrateCmd.desc)
    .action(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(['migrate'])
        .command(migrateCmd as any)
        .parse();
    });

  // show-invite
  serverCmd
    .command('show-invite')
    .description(showInviteCmd.desc)
    .action(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await yargs(['show-invite'])
        .command(showInviteCmd as any)
        .parse();
    });
}
