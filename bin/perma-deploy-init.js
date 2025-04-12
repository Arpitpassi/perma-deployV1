#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');
const Arweave = require('arweave');
const { execSync } = require('child_process');

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
      description: 'Base64 encoded 32-byte seed'
    })
    .option('sig-type', {
      type: 'string',
      description: 'The type of signer to be used for deployment',
      choices: ['arweave', 'ethereum', 'polygon'],
      default: 'arweave'
    })
    .option('deploy-folder', {
      type: 'string',
      description: 'Folder to deploy',
      default: 'dist'
    })
    .option('auto-deploy', {
      type: 'boolean',
      description: 'Setup automatic deployment on commit',
      default: false
    })
    .check(argv => {
      if (argv.sigType === 'arweave' && !argv.seed) {
        throw new Error('--seed is required when sig-type is arweave');
      }
      return true;
    })
    .argv;

  const projectName = argv['project-name'];
  const sigType = argv['sig-type'];

  // Define the .permaweb directory in the home directory
  const permawebDir = path.join(os.homedir(), '.permaweb');
  if (!fs.existsSync(permawebDir)) fs.mkdirSync(permawebDir);

  // Define the project-specific directory inside .permaweb
  const projectDir = path.join(permawebDir, projectName);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir);

  // Define the wallet path inside the project directory
  const walletPath = path.join(projectDir, 'wallet.json');

  let walletAddress = '';
  
  // Handle wallet creation based on sig-type
  if (sigType === 'arweave') {
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
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    // Save wallet to ~/.permaweb/<project-name>/wallet.json
    fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));
    console.log(`Arweave wallet saved to: ${walletPath}`);
    console.log(`Wallet address: ${walletAddress}`);
    console.log('Make sure to fund this wallet with AR or Turbo credits before deployment if the file size is greater that 100kb.');
  } else {
    console.log(`Using ${sigType} wallet for deployment. No wallet file needed.`);
    console.log('You will need to set the DEPLOY_KEY environment variable with your private key.');
    console.log('For Ethereum/Polygon wallets, provide the raw private key without encoding.');
  }

  // Create .perma-deploy directory if it doesn't exist
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  if (!fs.existsSync(permaDeployDir)) fs.mkdirSync(permaDeployDir);

  // Save config
  const config = {
    projectName,
    walletPath: sigType === 'arweave' ? walletPath : null,
    buildCommand: argv.build || 'npm run build',
    deployBranch: argv.branch || 'main',
    arnsName: argv.arns || null,
    undername: argv.undername || null,
    antProcess: argv['ant-process'] || null,
    deployFolder: argv['deploy-folder'] || 'dist',
    sigType,
    walletAddress
  };
  fs.writeFileSync(path.join(permaDeployDir, 'config.json'), JSON.stringify(config, null, 2));

  // Create deploy script in package.json
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Add deploy script
      if (!packageJson.scripts) packageJson.scripts = {};
      
      let deployCommand = 'perma-deploy-deploy';
      if (argv['ant-process']) {
        deployCommand += ` --ant-process ${argv['ant-process']}`;
      }
      if (argv.undername) {
        deployCommand += ` --undername ${argv.undername}`;
      }
      
      packageJson.scripts['deploy'] = deployCommand;
      
      // Add build and deploy combined script
      packageJson.scripts['build-and-deploy'] = `${argv.build || 'npm run build'} && npm run deploy`;
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('Added deploy scripts to package.json');
    }
  } catch (error) {
    console.warn(`Warning: Could not update package.json - ${error.message}`);
  }

  // Set up automatic deployment
  if (argv['auto-deploy']) {
    try {
      // Check if git is initialized
      if (!fs.existsSync(path.join(process.cwd(), '.git'))) {
        console.log('Initializing git repository...');
        execSync('git init', { stdio: 'inherit' });
      }
      
      // Setup pre-commit hook
      const hookScript = `#!/bin/sh
# Auto-deploy to Arweave
echo "Running auto-deploy to Arweave..."
npm run build-and-deploy
`;
      const hooksDir = path.join(process.cwd(), '.git', 'hooks');
      const hookPath = path.join(hooksDir, 'pre-commit');
      
      fs.writeFileSync(hookPath, hookScript);
      fs.chmodSync(hookPath, '755');
      console.log('Set up pre-commit hook for automatic deployment');
    } catch (error) {
      console.warn(`Warning: Could not set up automatic deployment - ${error.message}`);
    }
  }

  // Create a README.md file with deployment instructions if it doesn't exist
  const readmePath = path.join(process.cwd(), 'README.md');
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# ${projectName}

## Deployment Information

This project is configured to deploy to Arweave using the perma-deploy tools.

### Configuration
- Project name: ${projectName}
- Build command: ${argv.build || 'npm run build'}
- Deploy branch: ${argv.branch || 'main'}
- Deploy folder: ${argv['deploy-folder'] || 'dist'}
- Signer type: ${sigType}
${argv.arns ? `- ARNS name: ${argv.arns}` : ''}
${argv.undername ? `- Undername: ${argv.undername}` : ''}
${argv['ant-process'] ? `- ANT process: ${argv['ant-process']}` : ''}

### Deployment Instructions

1. Make sure your environment is properly set up:
   ${sigType === 'arweave' ? 
     `- The wallet at ${walletPath} should be funded with AR or Turbo credits.` : 
     `- Set the DEPLOY_KEY environment variable with your ${sigType} private key.`}

2. Deploy your application:
   \`\`\`
   npm run deploy
   \`\`\`

3. Or build and deploy in one step:
   \`\`\`
   npm run build-and-deploy
   \`\`\`

${argv['auto-deploy'] ? '**Note:** This project is configured to automatically deploy on every commit.' : ''}
`;
    fs.writeFileSync(readmePath, readmeContent);
    console.log('Created README.md with deployment instructions');
  }

  console.log('\nSetup complete!');
  console.log('Config saved to:', path.join(permaDeployDir, 'config.json'));
  
  if (argv['ant-process']) {
    console.log(`\nYour app will be deployed to: https://arweave.net/[YOUR_TX_ID]`);
    if (argv.arns && argv.undername) {
      console.log(`And will be accessible via: ${argv.undername}_${argv.arns}.ar`);
    } else if (argv.arns) {
      console.log(`And will be accessible via: ${argv.arns}.ar`);
    }
  }
  
  console.log('\nGet started with:');
  console.log('npm run build-and-deploy');
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});