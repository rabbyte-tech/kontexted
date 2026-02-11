import {
  isPlatformSupported,
  getPlatform,
  getBinaryPath,
  configExists,
  getServerStatus,
  startServer,
} from '@/lib/server';
import { CONFIG_FILE } from '@/lib/server/constants';

const DOCKER_URL = 'https://hub.docker.com/r/kontexted/kontexted';

function checkPrerequisites(): { valid: boolean; error?: string } {
  if (!isPlatformSupported()) {
    return { valid: false, error: `Platform not supported: ${getPlatform()}. Consider using Docker: ${DOCKER_URL}` };
  }
  if (!getBinaryPath()) {
    return { valid: false, error: 'Server binary not found. Run `kontexted server install` first.' };
  }
  if (!configExists()) {
    return { valid: false, error: 'Configuration not found. Run `kontexted server init` first.' };
  }
  const status = getServerStatus();
  if (status.running && status.pid) {
    return { valid: false, error: `Server is already running (PID: ${status.pid})` };
  }
  return { valid: true };
}

// ============ Yargs Command Module ============

export const command = 'start';
export const desc = 'Start the Kontexted server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs.option('foreground', {
    alias: 'f',
    type: 'boolean',
    description: 'Run server in foreground (blocking)',
  });
};

export const handler = async (argv: { foreground?: boolean }) => {
  const check = checkPrerequisites();
  if (!check.valid) {
    console.error('Error:', check.error);
    process.exit(1);
  }
  try {
    const pid = await startServer({ foreground: argv.foreground });
    console.log(argv.foreground ? `Server running (PID: ${pid})` : `Server started (PID: ${pid})`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};
