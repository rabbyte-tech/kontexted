import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { LOG_FILE } from '@/lib/server/constants';

// ============ Yargs Command Module ============

export const command = 'logs';
export const desc = 'View server logs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs
    .option('follow', {
      alias: 'f',
      type: 'boolean',
      description: 'Follow log output in real-time',
    })
    .option('lines', {
      alias: 'n',
      type: 'number',
      description: 'Number of lines to show',
      default: 50,
    });
};

export const handler = async (argv: { follow?: boolean; lines?: number }) => {
  if (!existsSync(LOG_FILE)) {
    console.log('No logs available');
    return;
  }
  if (argv.follow) {
    console.log(`Following ${LOG_FILE}... (Ctrl+C to exit)`);
    const tail = spawn('tail', ['-f', LOG_FILE]);
    tail.stdout.on('data', (data) => process.stdout.write(data));
    tail.stderr.on('data', (data) => process.stderr.write(data));
    process.on('SIGINT', () => { tail.kill(); process.exit(0); });
  } else {
    const lines = argv.lines ?? 50;
    const tail = spawn('tail', ['-n', lines.toString(), LOG_FILE]);
    tail.stdout.on('data', (data) => process.stdout.write(data));
  }
};
