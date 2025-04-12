#!/usr/bin/env node

import { ANT, ArweaveSigner } from '@ar.io/sdk';
import { EthereumSigner, TurboFactory } from '@ardrive/turbo-sdk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Function to retrieve commit hash
function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not retrieve commit hash. Using "unknown".');
    return 'unknown';
  }
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('deploy-folder', {
      alias: 'd',
      type: 'string',
      description: 'Folder to deploy.',
      default: 'dist'
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      description: 'Simulate deployment without uploading'
    })
    .option('ant-process', {
      alias: 'a',
      type: 'string',
      description: 'The ANT process ID.'
    })
    .option('undername', {
      alias: 'u',
      type: 'string',
      description: 'ANT undername to update.',
      default: '@'
    })
    .option('network', {
      alias: 'n',
      type: 'string',
      description: 'Network for Ethereum-based signers.',
      choices: ['ethereum', 'polygon'],
      default: 'ethereum'
    }).argv;

  // Support both custom config and direct parameters
  let config = {};
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  const useConfigFile = fs.existsSync(permaDeployDir);
  
  if (useConfigFile) {
    try {
      config = JSON.parse(fs.readFileSync(path.join(permaDeployDir, 'config.json'), 'utf-8'));
      console.log('Using configuration from .perma-deploy/config.json');
    } catch (error) {
      console.error('Error reading config file:', error.message);
      process.exit(1);
    }
  }

  // Merge config with command line arguments
  const deployFolder = path.resolve(process.cwd(), argv['deploy-folder'] || config.deployFolder || 'dist');
  const dryRun = argv['dry-run'] || false;
  const antProcess = argv['ant-process'] || config.antProcess;
  const undername = argv['undername'] || config.undername || '@';
  const network = argv['network'] || config.network || 'ethereum';
  const buildCommand = config.buildCommand || 'npm run build';
  const deployBranch = config.deployBranch || 'main';

  // Get the DEPLOY_KEY from environment variable or config file
  let DEPLOY_KEY = process.env.DEPLOY_KEY;
  if (!DEPLOY_KEY && useConfigFile && config.walletPath) {
    try {
      DEPLOY_KEY = fs.readFileSync(config.walletPath, 'utf-8');
    } catch (error) {
      console.error(`Error reading wallet from ${config.walletPath}:`, error.message);
      process.exit(1);
    }
  }
  if (!DEPLOY_KEY) {
    console.error('DEPLOY_KEY environment variable or walletPath not configured');
    process.exit(1);
  }

  // Check for ANT process
  if (!antProcess && !dryRun) {
    console.error('ANT process ID not configured. Use --ant-process or configure in .perma-deploy/config.json');
    process.exit(1);
  }

  // Branch check
  let currentBranch = null;
  try {
    execSync('git rev-parse HEAD', { stdio: 'ignore' });
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn('Warning: No commits found. Skipping branch check.');
  }

  if (currentBranch && currentBranch !== deployBranch) {
    console.log(`Not on deployment branch (${deployBranch}), skipping deployment.`);
    process.exit(0);
  }

  // Build project
  console.log('Building project...');
  try {
    execSync(buildCommand, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error: Build command failed.');
    process.exit(1);
  }

  if (!fs.existsSync(deployFolder) || fs.readdirSync(deployFolder).length === 0) {
    console.error(`Error: Deploy folder '${deployFolder}' is empty or does not exist.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would deploy folder: ${deployFolder}`);
    console.log('[DRY RUN] Deployment simulation completed successfully.');
    process.exit(0);
  }

  try {
    let signer;
    let token;

    // Infer signer type based on DEPLOY_KEY (from second script)
    try {
      // Try to parse as JSON for Arweave
      const parsedKey = JSON.parse(DEPLOY_KEY);
      
      // Check if it has typical Arweave JWK fields
      if (parsedKey.n && parsedKey.d) {
        signer = new ArweaveSigner(parsedKey);
        token = 'arweave';
      } else {
        throw new Error('Parsed JSON does not appear to be a valid Arweave key');
      }
    } catch (e) {
      // Not JSON, assume it's an Ethereum/Polygon private key
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(DEPLOY_KEY)) {
        signer = new EthereumSigner(DEPLOY_KEY);
        token = network === 'polygon' ? 'pol' : 'ethereum';
      } else {
        throw new Error('DEPLOY_KEY is not a valid Ethereum private key or Arweave wallet JSON');
      }
    }

    console.log(`Deploying folder: ${deployFolder}`);
    
    // Initialize TurboFactory with signer and token (adapted from first script for correctness)
    const turbo = TurboFactory.authenticated({
      signer: signer,
      token: token,
    });

    const uploadResult = await turbo.uploadFolder({
      folderPath: deployFolder,
      dataItemOpts: {
        tags: [
          {
            name: 'App-Name',
            value: 'PermaDeploy',
          },
          // prevents identical transaction Ids from eth wallets
          {
            name: 'anchor',
            value: new Date().toISOString(),
          },
        ],
      },
    });

    const manifestId = uploadResult.manifestResponse.id;
    console.log(`Manifest uploaded with ID: ${manifestId}`);

    // Update ANT record if applicable
    if (antProcess) {
      const ant = ANT.init({ processId: antProcess, signer });
      const commitHash = getCommitHash();
      
      // Update the ANT record (assumes the signer is a controller or owner)
      await ant.setUndernameRecord(
        {
          undername: undername,
          transactionId: manifestId,
          ttlSeconds: 3600,
        },
        {
          tags: [
            {
              name: 'GIT-HASH',
              value: commitHash || '',
            },
            {
              name: 'App-Name',
              value: 'PermaDeploy',
            },
            {
              name: 'anchor',
              value: new Date().toISOString(),
            },
          ],
        }
      );
      console.log(`Updated ANT record for process ${antProcess} with undername ${undername}`);
    }

    console.log(`View your deployment at: https://arweave.net/${manifestId}`);
    console.log('Deployment completed successfully.');
  } catch (error) {
    console.error('Deployment failed:', error.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});