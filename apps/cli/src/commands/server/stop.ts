import { getServerStatus, stopServer } from '@/lib/server';

// ============ Yargs Command Module ============

export const command = 'stop';
export const desc = 'Stop the Kontexted server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs.option('force', {
    type: 'boolean',
    description: 'Force kill the server (SIGKILL)',
  });
};

export const handler = async (argv: { force?: boolean }) => {
  const status = getServerStatus();
  if (!status.running) {
    console.log('Server is not running');
    return;
  }
  try {
    const stopped = await stopServer({ force: argv.force ?? false });
    if (stopped) {
      console.log('Server stopped');
    } else {
      console.error('Error: Failed to stop server');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};
