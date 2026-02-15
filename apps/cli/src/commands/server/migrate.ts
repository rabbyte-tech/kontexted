import { runMigration } from '@/lib/server';
import { isPlatformSupported, getPlatform, getMigratePath, configExists } from '@/lib/server';

const DOCKER_URL = 'https://hub.docker.com/r/rabbyte-tech/kontexted';

export const command = 'migrate';
export const desc = 'Run database migrations';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => yargs;

export const handler = async () => {
  // Check prerequisites
  if (!isPlatformSupported()) {
    console.error('Error:', `Platform not supported: ${getPlatform()}. Consider using Docker: ${DOCKER_URL}`);
    process.exit(1);
  }
  
  if (!getMigratePath()) {
    console.error('Error:', 'Migration binary not found.');
    process.exit(1);
  }
  
  if (!configExists()) {
    console.error('Error:', 'Configuration not found. Run `kontexted server init` first.');
    process.exit(1);
  }
  
  console.log('Running database migrations...\n');
  
  const result = await runMigration();
  
  if (!result.success) {
    console.error('\nError:', result.error);
    process.exit(1);
  }
  
  console.log('\n✓ Migrations completed successfully.');
};
