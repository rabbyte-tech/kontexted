import { existsSync } from 'fs';
import {
  isPlatformSupported,
  getPlatform,
  getBinaryPath,
  configExists,
  loadConfig,
  getServerStatus,
} from '@/lib/server';
import { CONFIG_FILE, DATA_DIR } from '@/lib/server/constants';

const DOCKER_URL = 'https://hub.docker.com/r/rabbyte-tech/kontexted';

// ============ Yargs Command Module ============

export const command = 'doctor';
export const desc = 'Run diagnostic checks';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => yargs;

export const handler = async () => {
  console.log('--- Server Diagnostics ---\n');

  const platform = getPlatform();
  const platformOk = isPlatformSupported();
  console.log(`${platformOk ? '✓' : '✗'} Platform: ${platform} ${platformOk ? '(supported)' : '(not supported)'}`);
  if (!platformOk) console.log(`  → Consider using Docker: ${DOCKER_URL}`);

  const binaryPath = getBinaryPath();
  console.log(`${binaryPath ? '✓' : '✗'} Binary: ${binaryPath || 'not found'}`);
  if (!binaryPath) console.log('  → Reinstall @kontexted/cli');

  const configOk = configExists();
  console.log(`${configOk ? '✓' : '✗'} Config: ${configOk ? CONFIG_FILE : 'not found'}`);
  if (!configOk) console.log('  → Run: kontexted server init');

  if (configOk) {
    const config = loadConfig();
    const dbPath = config?.database?.url || `${DATA_DIR}/kontexted.db`;
    const dbOk = existsSync(dbPath);
    console.log(`${dbOk ? '✓' : '⚠'} Database: ${dbPath}`);
  }

  const serverStatus = getServerStatus();
  console.log(`Server: ${serverStatus.running ? `Running (PID: ${serverStatus.pid})` : 'Not running'}`);
};
