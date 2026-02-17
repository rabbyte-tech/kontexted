import {
  isPlatformSupported,
  getPlatform,
  getBinaryPath,
  configExists,
  getServerStatus,
  startServer,
  loadConfig,
} from '@/lib/server';
import { CONFIG_FILE } from '@/lib/server/constants';

const DOCKER_URL = 'https://hub.docker.com/r/rabbyte-tech/kontexted';

/**
 * Creates a clickable terminal hyperlink using OSC 8 escape sequence
 * Falls back to plain URL for terminals that don't support it
 */
function formatClickableUrl(url: string, text?: string): string {
  const linkText = text || url;
  // OSC 8 escape sequence: \x1b]8;;url\x1b\\text\x1b]8;;\x1b\\
  return `\x1b]8;;${url}\x1b\\${linkText}\x1b]8;;\x1b\\`;
}

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
    
    // Load config to get host and port
    const config = loadConfig();
    const host = config?.server.host || 'localhost';
    const port = config?.server.port || 4729;
    const url = `http://${host}:${port}`;
    
    console.log(`Server started (PID: ${pid})`);
    console.log(`  → ${formatClickableUrl(url)}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};
