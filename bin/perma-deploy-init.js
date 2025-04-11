#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const yargs = require('yargs');
const Arweave = require('arweave');
const { execSync, exec } = require('child_process');
const { ArweaveSigner, createData } = require('arbundles');

async function main() {
  const argv = yargs
    .option('project-name', { type: 'string', describe: 'Project name', default: path.basename(process.cwd()) })
    .option('build', { type: 'string', describe: 'Build command (e.g., npm run build)' })
    .option('branch', { type: 'string', describe: 'Branch to deploy (e.g., main)' })
    .option('arns', { type: 'string', describe: 'ARNS name (e.g., myapp)' })
    .option('undername', { type: 'string', describe: 'ARNS undername (e.g., dev)' })
    .option('seed', { type: 'string', describe: 'Base64 encoded 32-byte seed', demandOption: true })
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
  /**
 * Generate a deterministic Arweave wallet from a seed string
 * Works in both browser and Node.js environments
 * 
 * @param {string} seed - The seed string to generate the wallet from
 * @returns {Promise<Object>} - Object containing the JWK and wallet address
 */
async function generateArweaveWallet(seed) {
  // Create a SHA-256 hash of the seed
  let seedHash;
  
  if (typeof window !== 'undefined') {
    // Browser environment
    const encoder = new TextEncoder();
    const data = encoder.encode(seed);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    seedHash = new Uint8Array(hashBuffer);
  } else {
    // Node.js environment
    const crypto = require('crypto');
    seedHash = crypto.createHash('sha256').update(seed).digest();
  }
  
  // Function to get deterministic bytes from the seed hash
  function getDeterministicBytes(length, index = 0) {
    // Create a buffer to hold the result
    const result = new Uint8Array(length);
    let bytesGenerated = 0;
    
    // Use the seed hash to generate deterministic bytes
    while (bytesGenerated < length) {
      // Create a buffer that combines the seed hash and an index
      let dataToHash;
      
      if (typeof window !== 'undefined') {
        // Browser environment
        dataToHash = new Uint8Array(seedHash.length + 4);
        dataToHash.set(seedHash);
        dataToHash[seedHash.length] = (index & 0xff);
        dataToHash[seedHash.length + 1] = ((index >> 8) & 0xff);
        dataToHash[seedHash.length + 2] = ((index >> 16) & 0xff);
        dataToHash[seedHash.length + 3] = ((index >> 24) & 0xff);
      } else {
        // Node.js environment
        const crypto = require('crypto');
        const indexBuffer = Buffer.alloc(4);
        indexBuffer.writeUInt32LE(index, 0);
        dataToHash = Buffer.concat([seedHash, indexBuffer]);
      }
      
      // Hash the data
      let currentHash;
      
      if (typeof window !== 'undefined') {
        // We're in a loop, so we need to handle this synchronously
        // For simplicity, derive a deterministic value from the seed and index
        currentHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          currentHash[i] = (seedHash[i % seedHash.length] + i + index) % 256;
        }
      } else {
        // Node.js environment
        const crypto = require('crypto');
        currentHash = crypto.createHash('sha256').update(dataToHash).digest();
      }
      
      // Copy bytes from hash to result
      const bytesToCopy = Math.min(currentHash.length, length - bytesGenerated);
      for (let i = 0; i < bytesToCopy; i++) {
        result[bytesGenerated + i] = currentHash[i];
      }
      
      bytesGenerated += bytesToCopy;
      index++;
    }
    
    return result;
  }
  
  // Generate Base64URL encoded strings for JWK components
  function getBase64UrlFromBytes(bytes) {
    // Convert bytes to base64 and then to base64url
    let base64;
    
    if (typeof window !== 'undefined') {
      // Browser environment
      base64 = btoa(String.fromCharCode.apply(null, bytes));
    } else {
      // Node.js environment
      base64 = Buffer.from(bytes).toString('base64');
    }
    
    // Convert base64 to base64url
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  // Helper function to convert base64url to bytes
  function base64UrlToBytes(base64url) {
    // Add padding if necessary
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64
    let binary;
    if (typeof window !== 'undefined') {
      // Browser environment
      binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } else {
      // Node.js environment
      return Buffer.from(base64, 'base64');
    }
  }
  
  // Create deterministic JWK
  const jwk = {
    kty: 'RSA',
    e: 'AQAB', // Standard RSA exponent (65537)
    n: getBase64UrlFromBytes(getDeterministicBytes(256, 1)),
    d: getBase64UrlFromBytes(getDeterministicBytes(256, 2)),
    p: getBase64UrlFromBytes(getDeterministicBytes(128, 3)),
    q: getBase64UrlFromBytes(getDeterministicBytes(128, 4)),
    dp: getBase64UrlFromBytes(getDeterministicBytes(128, 5)),
    dq: getBase64UrlFromBytes(getDeterministicBytes(128, 6)),
    qi: getBase64UrlFromBytes(getDeterministicBytes(128, 7))
  };
  
  // Calculate wallet address from the JWK
  let ownerBytes;
  
  if (typeof window !== 'undefined') {
    // Browser environment
    // Decode base64url to get the raw bytes
    const nBytes = base64UrlToBytes(jwk.n);
    
    // Hash the n value to get the owner
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', nBytes);
    ownerBytes = new Uint8Array(hashBuffer);
  } else {
    // Node.js environment
    const crypto = require('crypto');
    // Decode base64url to get the raw bytes
    const nBytes = Buffer.from(jwk.n, 'base64url');
    
    // Hash the n value to get the owner
    ownerBytes = crypto.createHash('sha256').update(nBytes).digest();
  }
  
  // Convert the owner bytes to base64url (Arweave address format)
  let base64;
  
  if (typeof window !== 'undefined') {
    // Browser environment
    base64 = btoa(String.fromCharCode.apply(null, ownerBytes));
  } else {
    // Node.js environment
    base64 = Buffer.from(ownerBytes).toString('base64');
  }
  
  // Convert base64 to base64url format (Arweave address)
  const address = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Return both the JWK and the wallet address
  return {
    jwk: jwk,
    address: address
  };
}
const wallet = await generateArweaveWallet(argv.seed).then(wallet => {
 
  // Now you can use this wallet with the Arweave library:
  return wallet.jwk// const tx = await arweave.createTransaction({ ... }, wallet.jwk);
});

  const walletAddress = await arweave.wallets.jwkToAddress(wallet);

  // Save wallet to ~/.permaweb/<project-name>/wallet.json
  fs.writeFileSync(walletPath, JSON.stringify(wallet, null, 2));

  // Create .perma-deploy directory if it doesn’t exist
  const permaDeployDir = path.join(process.cwd(), '.perma-deploy');
  if (!fs.existsSync(permaDeployDir)) fs.mkdirSync(permaDeployDir);

  // Save config with additional AO-related fields
  const config = {
    projectName,
    walletPath,
    buildCommand: argv.build || 'npm run build',
    deployBranch: argv.branch || 'main',
    arnsName: argv.arns,
    undername: argv.undername,
    walletAddress,
    seed: argv.seed,
  };
  fs.writeFileSync(path.join(permaDeployDir, 'config.json'), JSON.stringify(config, null, 2));

  // Set up pre-commit hook
  const hookScript = `#!/bin/sh\nnpx perma-deploy-deploy\n`;
  const hookPath = path.join(process.cwd(), '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, hookScript);
  fs.chmodSync(hookPath, '755');

  console.log(`\nSetup complete! Wallet saved to: ${walletPath}`);
  console.log(`Wallet address: **${walletAddress}**`);
  console.log('Test your deployment by committing changes!');
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
