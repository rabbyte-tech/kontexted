import { getServerStatus, loadConfig } from '@/lib/server';
import { CONFIG_FILE, LOG_FILE } from '@/lib/server/constants';

// ============ Yargs Command Module ============

export const command = 'status';
export const desc = 'Show server status';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => yargs;

export const handler = async () => {
  const status = getServerStatus();
  if (!status.running) {
    console.log('Server Status: Not running');
    return;
  }
  const config = loadConfig();
  console.log('Server Status: Running');
  console.log(`  PID: ${status.pid}`);
  if (config) {
    console.log(`  Port: ${config.server.port}`);
    console.log(`  Host: ${config.server.host}`);
  }
  console.log(`  Config: ${CONFIG_FILE}`);
  console.log(`  Logs: ${LOG_FILE}`);
};
