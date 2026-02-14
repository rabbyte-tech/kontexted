import { loadConfig, configExists, CONFIG_FILE } from '@/lib/server';

/**
 * Shows the invite code from the server configuration
 */
async function runShowInvite(): Promise<void> {
  if (!configExists()) {
    console.error('Error: No configuration found.');
    console.log('  Run `kontexted server init` to create a configuration.');
    process.exit(1);
  }

  const config = loadConfig();
  
  if (!config) {
    console.error('Error: Failed to load configuration.');
    process.exit(1);
  }

  console.log(`Config file: ${CONFIG_FILE}\n`);
  console.log(`Your invite code: ${config.auth.inviteCode}`);
  console.log('(Use this code to sign up for a new account)');
}

// ============ Yargs Command Module ============

export const command = 'show-invite';
export const desc = 'Display the invite code for user sign-up';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builder = (yargs: any) => {
  return yargs;
};

export const handler = async () => {
  await runShowInvite();
};
