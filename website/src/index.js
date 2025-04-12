let generatedCommand = '';
let projectWalletAddress = '';
let walletSeed = '';
let mainWalletConnected = false;
let sdkLoaded = false;
let arweaveInstance = null;
let arnsData = []; // Store ARNS name and processId pairs
const REGISTRY_PROCESS_ID = 'i_le_yKKPVstLTDSmkHRqf-wYphMnwB9OhleiTgMkWc';
const NAMES_PROCESS_ID = 'agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA';
const AO_GATEWAY = 'https://ao.link';

function logDebug(message) {
  const debugPanel = document.getElementById('debugPanel');
  const timestamp = new Date().toLocaleTimeString();
  debugPanel.innerHTML += `<div>[${timestamp}] ${message}</div>`;
  debugPanel.scrollTop = debugPanel.scrollHeight;
  console.log(message);
}

function toggleDebugPanel() {
  const debugPanel = document.getElementById('debugPanel');
  debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
}

function initArweave() {
  if (window.Arweave) {
    arweaveInstance = Arweave.init({ host: 'arweave.net', port: 443, protocol: 'https' });
    logDebug('Arweave initialized successfully');
    return arweaveInstance;
  }
  throw new Error('Arweave SDK not loaded');
}

document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlWallet = urlParams.get('wallet');
  if (urlWallet) {
    projectWalletAddress = urlWallet;
    document.getElementById('projectWalletInput').value = projectWalletAddress;
    document.getElementById('projectWalletDisplay').textContent = `Project Wallet Address: ${projectWalletAddress}`;
    document.getElementById('topUpButton').disabled = !mainWalletConnected;
    document.getElementById('grantButton').disabled = !mainWalletConnected;
  }
  
  logDebug(`Available globals - Arweave: ${typeof window.Arweave !== 'undefined'}, arIO: ${typeof window.arIO !== 'undefined'}, window.arweaveWallet: ${typeof window.arweaveWallet !== 'undefined'}`);
  
  try {
    initArweave();
  } catch (error) {
    logDebug(`Failed to initialize Arweave: ${error.message}`);
    document.getElementById('walletStatus').textContent = 'Error initializing Arweave. Please refresh the page.';
    document.getElementById('walletStatus').className = 'status-message error';
  }
});

function checkWalletAvailability() {
  const wanderWallet = window.arweaveWallet;
  if (wanderWallet) {
    logDebug('Wander wallet detected');
    return { wallet: wanderWallet, type: 'wander' };
  } else if (window.ethereum && window.ethereum.isMetaMask) {
    logDebug('MetaMask detected, but not compatible');
    return { wallet: null, type: 'unsupported', message: 'MetaMask detected but not compatible with Arweave. Please install Wander wallet.' };
  } else {
    logDebug('No wallet detected');
    return { wallet: null, type: 'none', message: 'No Arweave wallet detected. Please install Wander wallet.' };
  }
}

function isSdkLoaded() {
  const arweaveLoaded = typeof window.Arweave !== 'undefined';
  const arIOLoaded = typeof window.arIO !== 'undefined' && typeof window.arIO.ANTRegistry !== 'undefined';
  logDebug(`SDK check - Arweave: ${arweaveLoaded}, arIO: ${arIOLoaded}`);
  return arweaveLoaded && arIOLoaded;
}

async function waitForSdkToLoad(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (isSdkLoaded()) {
      sdkLoaded = true;
      logDebug('SDKs already loaded');
      return resolve();
    }
    
    logDebug(`Waiting for SDKs to load (timeout: ${timeout}ms)`);
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (isSdkLoaded()) {
        clearInterval(checkInterval);
        sdkLoaded = true;
        logDebug('SDKs loaded successfully');
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        logDebug(`SDK loading timeout after ${timeout}ms`);
        reject(new Error('SDK loading timeout. Please refresh the page.'));
      }
    }, 100);
  });
}

async function initializeAndConnectWallet() {
  const statusEl = document.getElementById('walletStatus');
  
  try {
    statusEl.innerHTML = '<span class="loading"></span> Checking wallet availability...';
    statusEl.className = 'status-message';
    
    const walletInfo = checkWalletAvailability();
    
    if (!walletInfo.wallet) {
      throw new Error(walletInfo.message || 'Wander wallet not detected. Please install Wander.');
    }
    
    logDebug(`Using wallet type: ${walletInfo.type}`);
    
    statusEl.innerHTML = '<span class="loading"></span> Loading AR.IO SDK...';
    
    if (!sdkLoaded) {
      await waitForSdkToLoad(15000);
    }
    
    statusEl.innerHTML = '<span class="loading"></span> Connecting to wallet...';
    
    await window.arweaveWallet.connect(['SIGN_TRANSACTION', 'ACCESS_ADDRESS']);
    const address = await window.arweaveWallet.getActiveAddress();
    logDebug(`Connected wallet address: ${address}`);
    
    mainWalletConnected = true;
    document.getElementById('topUpButton').disabled = !projectWalletAddress;
    document.getElementById('grantButton').disabled = !projectWalletAddress;
    
    statusEl.innerHTML = '<span class="loading"></span> Fetching ARNS names...';
    await populateArnsNames(address);
    
    statusEl.textContent = 'Wallet connected and ARNS names loaded!';
    statusEl.className = 'status-message success';
  } catch (error) {
    console.error('Initialization error:', error);
    logDebug(`Initialization error: ${error.message}`);
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-message error';
  }
}

async function fetchWalletOwnedNames(walletAddress) {
  const registryUrl = 'https://cu138.ao-testnet.xyz/dry-run?process-id=i_le_yKKPVstLTDSmkHRqf-wYphMnwB9OhleiTgMkWc';
  const namesUrl = 'https://cu.ar-io.dev/dry-run?process-id=agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA';
  
  const headers = {
    'accept': '*/*',
    'content-type': 'application/json',
    'origin': 'https://arns.app',
    'referer': 'https://arns.app/'
  };

  try {
    logDebug(`Fetching owned process IDs for wallet: ${walletAddress}`);
    
    // First API call to get owned process IDs
    const registryBody = JSON.stringify({
      Id: "1234",
      Target: REGISTRY_PROCESS_ID,
      Owner: "1234",
      Anchor: "0",
      Data: "1234",
      Tags: [
        { name: "Action", value: "Access-Control-List" },
        { name: "Address", value: walletAddress },
        { name: "Data-Protocol", value: "ao" },
        { name: "Type", value: "Message" },
        { name: "Variant", value: "ao.TN.1" }
      ]
    });

    const registryResponse = await fetch(registryUrl, { method: 'POST', headers, body: registryBody });
    const registryData = await registryResponse.json();

    let ownedProcessIds = [];
    if (registryData.Messages && registryData.Messages.length > 0) {
      const ownedData = JSON.parse(registryData.Messages[0].Data);
      ownedProcessIds = ownedData.Owned || [];
      logDebug(`Found ${ownedProcessIds.length} owned process IDs`);
    }

    // Second API call to get names
    logDebug(`Fetching ARNS names data`);
    const namesBody = JSON.stringify({
      Id: "1234",
      Target: NAMES_PROCESS_ID,
      Owner: "1234",
      Anchor: "0",
      Data: "1234",
      Tags: [
        { name: "Action", value: "Paginated-Records" },
        { name: "Limit", value: "50000" },
        { name: "Data-Protocol", value: "ao" },
        { name: "Type", value: "Message" },
        { name: "Variant", value: "ao.TN.1" }
      ]
    });

    const namesResponse = await fetch(namesUrl, { method: 'POST', headers, body: namesBody });
    const namesData = await namesResponse.json();

    const processIdToName = new Map();
    if (namesData.Messages && namesData.Messages.length > 0) {
      const items = JSON.parse(namesData.Messages[0].Data).items || [];
      logDebug(`Received ${items.length} ARNS name records`);
      
      for (const item of items) {
        if (ownedProcessIds.includes(item.processId)) {
          processIdToName.set(item.processId, item.name);
        }
      }
    }

    // Match process IDs with names
    const result = ownedProcessIds.map(processId => ({
      name: processIdToName.get(processId) || processId,
      processId
    }));
    
    logDebug(`Matched ${result.length} owned ARNS names`);
    return result;
  } catch (error) {
    logDebug(`Error fetching wallet owned names: ${error.message}`);
    throw error;
  }
}

async function populateArnsNames(address) {
  try {
    logDebug('Fetching ARNS names for address: ' + address);
    
    const names = await fetchWalletOwnedNames(address);
    arnsData = names;
    logDebug(`Retrieved ${names.length} ARNS names`);
    
    const dropdown = document.getElementById('arnsNames');
    dropdown.innerHTML = '<option value="">Select an ARNS Name</option>';
    
    if (names.length === 0) {
      document.getElementById('walletStatus').textContent = 'Wallet connected! No ARNS names found for this wallet.';
      return;
    }
    
    names.forEach(item => {
      const option = document.createElement('option');
      option.value = item.processId;
      option.textContent = item.name;
      dropdown.appendChild(option);
    });
    
  } catch (error) {
    logDebug(`Error populating ARNS names: ${error.message}`);
    throw error;
  }
}

function usePastedWallet() {
  const pastedWallet = document.getElementById('projectWalletInput').value.trim();
  if (!pastedWallet) {
    alert('Please enter a valid wallet address.');
    document.getElementById('status').textContent = 'Error: Please enter a valid wallet address.';
    document.getElementById('status').className = 'status-message error';
    return;
  }
  projectWalletAddress = pastedWallet;
  document.getElementById('projectWalletDisplay').textContent = `Project Wallet Address: ${pastedWallet}`;
  document.getElementById('topUpButton').disabled = !mainWalletConnected;
  document.getElementById('grantButton').disabled = !mainWalletConnected;
  logDebug(`Set project wallet address: ${pastedWallet}`);
  document.getElementById('status').textContent = 'Project wallet address set successfully!';
  document.getElementById('status').className = 'status-message success';
}

