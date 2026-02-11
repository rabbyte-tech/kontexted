import { spawn } from 'child_process';
import { getMigratePath } from './binary.js';
import { loadConfig } from './config.js';

export interface MigrationResult {
  success: boolean;
  error?: string;
}

/**
 * Runs database migrations using the kontexted-migrate binary
 * Sets environment variables from config and spawns the migration process
 */
export async function runMigration(): Promise<MigrationResult> {
  const migratePath = getMigratePath();
  
  if (!migratePath) {
    return { 
      success: false, 
      error: 'Migration binary not found. Ensure the platform package is installed.' 
    };
  }
  
  const config = loadConfig();
  if (!config) {
    return { 
      success: false, 
      error: 'Configuration not found. Run `kontexted server init` first.' 
    };
  }
  
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DATABASE_URL: config.database.url,
      DATABASE_DIALECT: config.database.dialect,
    };
    
    const child = spawn(migratePath, [], {
      env,
      stdio: 'inherit', // Show output directly
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ 
          success: false, 
          error: `Migration exited with code ${code}` 
        });
      }
    });
    
    child.on('error', (err) => {
      resolve({ 
        success: false, 
        error: `Failed to run migration: ${err.message}` 
      });
    });
  });
}
