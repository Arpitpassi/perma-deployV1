#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Arweave = require('arweave');
const { TurboFactory } = require('@ardrive/turbo-sdk');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const ANT = require('@ar.io/sdk');

// Function to retrieve commit hash
function getCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn('Warning: Could not retrieve commit hash. Using "unknown".');
    return 'unknown';
  }
}

// Function to upload a file using Turbo
async function uploadFile(filePath, dryRun, turbo, contentType) {
  if (dryRun) {
    const fakeId = 'fake-' + Math.random().toString(36).substr(2, 9);
    console.log(`[DRY RUN] Would upload ${filePath} with ID ${fakeId}`);
    return fakeId;
  }
  try {
    const uploadResult = await turbo.uploadFile({
      fileStreamFactory: () => fs.createReadStream(filePath),
      fileSizeFactory: () => fs.statSync(filePath).size,
      signal: AbortSignal.timeout(10_000),
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: contentType },
          { name: 'App-Name', value: 'PermaDeploy' } // Added for dashboard compatibility
        ]
      }
    });
    console.log(`Uploaded ${filePath} with ID: ${uploadResult.id}`);
    return uploadResult.id;
  } catch (error) {
    console.error(`Error uploading ${filePath}: ${error.message}`);
    throw error;
  }
}

// Function to get all files recursively
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, arrayOfFiles);
    } else {
      arrayOfFiles.push(filePath);
    }
  });
  return arrayOfFiles;
}

// Function to get content type based on file extension
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('deploy-folder', { type: 'string', default: 'dist', description: 'Folder to deploy' })
    .option('dry-run', { type: 'boolean', default: false, description: 'Simulate deployment' })
    .argv;

  const deployFolder = path.resolve(process.cwd(), argv['deploy-folder']);
  const dryRun = argv['dry-run'];

  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  if (!fs.existsSync(permaDeployDir)) {
    console.error('Error: .perma-deploy directory not found. Run perma-deploy-init first.');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(path.join(permaDeployDir, 'config.json'), 'utf-8'));
  const wallet = JSON.parse(fs.readFileSync(config.walletPath, 'utf-8'));

  let currentBranch = null;
  try {
    execSync('git rev-parse HEAD', { stdio: 'ignore' });
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (error) {
    console.warn('Warning: No commits found. Skipping branch check.');
  }

  if (currentBranch && currentBranch !== config.deployBranch) {
    console.log(`Not on deployment branch (${config.deployBranch}), skipping deployment.`);
    process.exit(0);
  }

  console.log('Building project...');
  try {
    execSync(config.buildCommand, { stdio: 'inherit' });
  } catch (error) {
    console.error('Error: Build command failed.');
    process.exit(1);
  }

  if (!fs.existsSync(deployFolder) || fs.readdirSync(deployFolder).length === 0) {
    console.error(`Error: Deploy folder '${deployFolder}' is empty or does not exist.`);
    process.exit(1);
  }

  const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
  const turbo = TurboFactory.authenticated({ privateKey: wallet });
  console.log('Turbo authenticated with wallet address:', await arweave.wallets.jwkToAddress(wallet));

  console.log(`Deploying folder: ${deployFolder}`);
  const files = getAllFiles(deployFolder);
  const fileTxIds = {};
  for (const file of files) {
    const relativePath = path.relative(deployFolder, file);
    const contentType = getContentType(file);
    try {
      const txId = await uploadFile(file, dryRun, turbo, contentType);
      fileTxIds[relativePath] = { id: txId };
    } catch (error) {
      console.error(`Skipping ${file} due to upload failure. Continuing deployment...`);
      fileTxIds[relativePath] = { id: 'upload-failed' };
    }
  }

  const manifest = {
    manifest: 'arweave/paths',
    version: '0.1.0',
    index: { path: 'index.html' },
    paths: fileTxIds
  };
  const manifestPath = path.join(deployFolder, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  let manifestTxId;
  try {
    manifestTxId = await uploadFile(manifestPath, dryRun, turbo, 'application/x.arweave-manifest+json');
    console.log(`Manifest uploaded with ID: ${manifestTxId}`);
    
    if (config.antProcess) {
      const ant = ANT.init({ processId: config.antProcess, signer: { wallet } });
      const commitHash = getCommitHash();
      // Update the ANT record (assumes the signer is a controller or owner)
      await ant.setUndernameRecord(
        {
          undername: config.undername || '',
          transactionId: manifestTxId,
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
              value: 'Anantaweb',
            },
            {
              name: 'anchor',
              value: new Date().toISOString(),
            },
          ],
        }
      );
      console.log(`Updated ANT record for process ${config.antProcess}`);
    } else {
      console.warn('No ANT process ID found in config. Skipping ANT record update.');
    }

  } catch (error) {
    console.error(`Error uploading manifest or updating ANT record: ${error.message}. Using placeholder ID.`);
    manifestTxId = 'upload-failed';
  }
  
  console.log(`View your deployment at: https://arweave.net/${manifestTxId}`);
  console.log('Deployment completed successfully.');
}

main().catch(err => {
  console.error('Deployment failed:', err.message);
  process.exit(1);
});