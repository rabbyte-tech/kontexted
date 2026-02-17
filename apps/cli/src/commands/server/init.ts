import {
  configExists,
  getDefaultConfig,
  saveConfig,
  ServerConfig,
  getMigrationsDir,
  getPublicDir,
  runMigration,
} from '@/lib/server';
import { CONFIG_FILE, DATA_DIR } from '@/lib/server/constants';
import * as readline from 'readline';

// ============ Helper Functions ============

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function promptQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

async function runInit(interactive: boolean): Promise<void> {
  if (interactive) {
    const rl = createPrompt();
    try {
      if (configExists()) {
        const answer = await promptQuestion(rl, 'Config already exists. Overwrite? (y/N): ');
        if (answer.trim().toLowerCase() !== 'y') {
          console.log('Initialization cancelled.');
          return;
        }
      }

      console.log('\n--- Server Configuration ---');

      const dialectAnswer = await promptQuestion(rl, 'Database dialect (sqlite/postgresql) [sqlite]: ');
      const dialect = (dialectAnswer.trim().toLowerCase() || 'sqlite') as 'sqlite' | 'postgresql';
      if (dialect !== 'sqlite' && dialect !== 'postgresql') {
        console.log('Invalid dialect. Using sqlite.');
      }

      const defaultUrl = dialect === 'sqlite' ? `${DATA_DIR}/kontexted.db` : 'postgresql://localhost:5432/kontexted';
      const urlAnswer = await promptQuestion(rl, `Database URL [${defaultUrl}]: `);
      const databaseUrl = urlAnswer.trim() || defaultUrl;

      const portAnswer = await promptQuestion(rl, 'Server port [4729]: ');
      const port = parseInt(portAnswer.trim(), 10) || 4729;

      const hostAnswer = await promptQuestion(rl, 'Server host [localhost]: ');
      const host = hostAnswer.trim() || 'localhost';

      const levelAnswer = await promptQuestion(rl, 'Log level (debug/info/warn/error) [info]: ');
      const level = (levelAnswer.trim().toLowerCase() || 'info') as 'debug' | 'info' | 'warn' | 'error';

      const migrationsDir = getMigrationsDir();
      const publicDir = getPublicDir();

      const defaultConfig = getDefaultConfig();
      const config: ServerConfig = {
        database: { dialect, url: databaseUrl },
        server: { 
          port, 
          host,
          trustedOrigins: defaultConfig.server.trustedOrigins,
        },
        logging: { level },
        collab: { tokenSecret: defaultConfig.collab.tokenSecret },
        auth: {
          betterAuthSecret: defaultConfig.auth.betterAuthSecret,
          inviteCode: defaultConfig.auth.inviteCode,
          method: defaultConfig.auth.method,
        },
        paths: {
          migrationsDir: migrationsDir || undefined,
          publicDir: publicDir || undefined,
        },
      };

      saveConfig(config);
      console.log('\n✓ Configuration saved to:', CONFIG_FILE);
      console.log('\n  Your invite code: ' + config.auth.inviteCode);
      console.log('  (Save this code - you\'ll need it to sign up)\n');
      
      const migrateAnswer = await promptQuestion(rl, '\nRun database migrations now? (Y/n): ');
      if (migrateAnswer.trim().toLowerCase() !== 'n') {
        console.log('\nRunning migrations...\n');
        const result = await runMigration();
        if (result.success) {
          console.log('\n✓ Migrations completed.');
        } else {
          console.error('\n⚠ Migration failed:', result.error);
          console.log('  You can run migrations later with: kontexted server migrate');
        }
      } else {
        console.log('\nYou can run migrations later with: kontexted server migrate');
      }
    } finally {
      rl.close();
    }
  } else {
    if (configExists()) {
      console.error('Error: Configuration already exists.');
      console.log('  Run with --interactive to reinitialize.');
      process.exit(1);
    }
    const config = getDefaultConfig();
    saveConfig(config);
    console.log('✓ Configuration created:', CONFIG_FILE);
    console.log('  Database:', config.database.url);
    console.log('  Server:', `${config.server.host}:${config.server.port}`);
    console.log('\n  Your invite code: ' + config.auth.inviteCode);
    console.log('  (Save this code - you\'ll need it to sign up)');
    console.log('\nRun migrations with: kontexted server migrate');
  }
}

// ============ Yargs Command Module ============

export const command = 'init';
export const desc = 'Initialize server configuration';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs.option('interactive', {
    alias: 'i',
    type: 'boolean',
    description: 'Interactive mode to customize configuration',
  });
};

export const handler = async (argv: { interactive?: boolean }) => {
  await runInit(argv.interactive ?? false);
};
