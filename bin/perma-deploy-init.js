#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const Arweave = require('arweave');

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('project-name', {
      type: 'string',
      description: 'Project name',
      default: path.basename(process.cwd())
    })
    .option('build', {
      type: 'string',
      description: 'Build command (e.g., npm run build)'
    })
    .option('branch', {
      type: 'string',
      description: 'Branch to deploy (e.g., main)'
    })
    .option('arns', {
      type: 'string',
      description: 'ARNS name (e.g., myapp)'
    })
    .option('undername', {
      type: 'string',
      description: 'ARNS undername (e.g., dev)'
    })
    .option('ant-process', {
      type: 'string',
      description: 'ANT process ID (e.g., SvcHmgBgdRi4mAAcpw4zVcHnhyWGOyZWIMM3c1ABaEA)'
    })
    .option('seed', {
      type: 'string',
      description: 'Base64 encoded 32-byte seed',
      demandOption: true
    })
    .argv;

  const projectName = argv['project-name'];

  // Define the .permaweb directory in the home directory
  const permawebDir = path.join(os.homedir(), '.permaweb');
  if (!fs.existsSync(permawebDir)) fs.mkdirSync(permawebDir);

  // Define the project-specific directory inside .permaweb
  const projectDir = path.join(permawebDir, projectName);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);

  // Define the wallet path inside the project directory
  const walletPath = path.join(projectDir, 'wallet.json');

  // Validate base64 seed
  let seedBuffer;
  try {
    seedBuffer = Buffer.from(argv.seed, 'base64');
    if (seedBuffer.length !== 32) throw new Error('Seed must be 32 bytes.');
  } catch (error) {
    console.error(`Error: Invalid base64 seed - ${error.message}`);
    process.exit(1);
  }

  // Initialize Arweave
  const arweave = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
  const wallet = await arweave.wallets.generate(); // Generate JWK
  const walletAddress = await arweave.wallets.jwkToAddress(wallet);

  // Save wallet to ~/.permaweb/<project-name>/wallet.json
  fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));

  // Create .perma-deploy directory if it doesn’t exist
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  if (!fs.existsSync(permaDeployDir)) fs.mkdirSync(permaDeployDir);

  // Save config
  const config = {
    projectName,
    walletPath,
    buildCommand: argv.build || 'npm run build',
    deployBranch: argv.branch || 'main',
    arnsName: argv.arns || null,
    undername: argv.undername || null,
    antProcess: argv['ant-process'] || null,
    walletAddress
  };
  fs.writeFileSync(path.join(permaDeployDir, 'config.json'), JSON.stringify(config, null, 2));

  // Set up pre-commit hook
  const hookScript = `#!/bin/sh\nnpx perma-deploy-deploy\n`;
  const hookPath = path.join(process.cwd(), '.git', 'hooks', 'pre-commit');
  if (fs.existsSync(path.join(process.cwd(), '.git'))) {
    fs.writeFileSync(hookPath, hookScript);
    fs.chmodSync(hookPath, '755');
  } else {
    console.warn('Warning: No .git directory found. Skipping pre-commit hook setup.');
  }

  console.log(`\nSetup complete! Wallet saved to: ${walletPath}`);
  console.log(`Wallet address: **${walletAddress}**`);
  console.log('Config saved to:', path.join(permaDeployDir, 'config.json'));
  console.log('Test your deployment by committing changes!');
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});