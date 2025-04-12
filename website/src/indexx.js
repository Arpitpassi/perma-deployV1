async function generateCommand() {
    try {
      const installCommand = document.getElementById('installCommand').value || 'npm install perma-deployV1';
      const buildCommand = document.getElementById('buildCommand').value || 'npm run build';
      const branch = document.getElementById('branch').value || 'main';
      const arnsSelect = document.getElementById('arnsNames');
      const selectedProcessId = arnsSelect.value;
      const arnsName = selectedProcessId ? arnsSelect.options[arnsSelect.selectedIndex].textContent : '';
      const undername = document.getElementById('undername').value || '';
  
      // Generate random seed
      const seedArray = window.crypto.getRandomValues(new Uint8Array(32));
      walletSeed = btoa(String.fromCharCode.apply(null, seedArray));
  
      // Generate installation and initialization commands
      const initCommand = `npx perma-deploy-init --build "${buildCommand}" --branch "${branch}"${arnsName ? ` --arns "${arnsName}"` : ''}${undername ? ` --undername "${undername}"` : ''}${selectedProcessId ? ` --ant-process "${selectedProcessId}"` : ''} --seed "${walletSeed}"`;
      
      // Combine commands
      generatedCommand = `# First install the package\n${installCommand}\n\n# Then initialize your project\n${initCommand}`;
  
      // Update UI
      document.getElementById('commandOutput').textContent = generatedCommand;
      document.getElementById('seedOutput').textContent = `Base64 Seed: ${walletSeed}`;
      document.getElementById('copyCommandBtn').style.display = 'block';
      document.getElementById('copySeedBtn').style.display = 'block';
    } catch (error) {
      console.error('Error generating command:', error);
      logDebug(`Error generating command: ${error.message}`);
      document.getElementById('commandOutput').textContent = `Error: ${error.message}`;
      document.getElementById('status').textContent = `Error: ${error.message}`;
      document.getElementById('status').className = 'status-message error';
    }
  }
  
  function copyCommand() {
    navigator.clipboard.writeText(generatedCommand)
      .then(() => alert('Command copied!'))
      .catch(err => console.error('Failed to copy command:', err));
  }
  
  function copySeed() {
    navigator.clipboard.writeText(walletSeed)
      .then(() => alert('Seed phrase copied! Keep it safe!'))
      .catch(err => console.error('Failed to copy seed:', err));
  }
  
  async function topUpWallet() {
    const statusEl = document.getElementById('status');
    statusEl.innerHTML = '<span class="loading"></span> Initiating top-up...';
    statusEl.className = 'status-message';
  
    try {
      if (!window.arweaveWallet) {
        throw new Error('Wander wallet not detected. Please install Wander.');
      }
      if (!mainWalletConnected) {
        throw new Error('Please connect your wallet first.');
      }
      if (!projectWalletAddress) {
        throw new Error('Please set a project wallet address.');
      }
  
      const permissions = await window.arweaveWallet.getPermissions();
      logDebug(`Current wallet permissions: ${permissions}`);
      if (!permissions.includes('SIGN_TRANSACTION') || !permissions.includes('ACCESS_ADDRESS')) {
        await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION'], { name: 'PermaDeploy' });
        logDebug('Requested ACCESS_ADDRESS and SIGN_TRANSACTION permissions');
      }
  
      if (!arweaveInstance) {
        arweaveInstance = initArweave();
      }
  
      logDebug(`Topping up ${projectWalletAddress} with 0.1 AR`);
  
      const senderAddress = await window.arweaveWallet.getActiveAddress();
      logDebug(`Sender address: ${senderAddress}`);
  
      const balanceWinston = await arweaveInstance.wallets.getBalance(senderAddress);
      const balanceAR = arweaveInstance.ar.winstonToAr(balanceWinston);
      logDebug(`Sender balance: ${balanceAR} AR`);
      if (parseFloat(balanceAR) < 0.1) {
        throw new Error('Insufficient balance in sender wallet. Need at least 0.1 AR.');
      }
  
      const amount = arweaveInstance.ar.arToWinston('0.1');
      if (!amount) {
        throw new Error('Failed to convert AR to Winston.');
      }
      logDebug(`Amount in Winston: ${amount}`);
  
      const tx = await arweaveInstance.createTransaction({
        target: projectWalletAddress,
        quantity: amount
      }, 'use_wallet');
  
      logDebug(`Transaction created: ${JSON.stringify(tx, null, 2)}`);
  
      statusEl.innerHTML = '<span class="loading"></span> Signing transaction...';
      const signedTx = await window.arweaveWallet.sign(tx);
      logDebug(`Signed transaction: ${JSON.stringify(signedTx, null, 2)}`);
  
      statusEl.innerHTML = '<span class="loading"></span> Submitting transaction...';
      const response = await arweaveInstance.transactions.post(signedTx);
      logDebug(`Submission response: ${response.status} - ${response.statusText}`);
  
      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`Transaction failed with status ${response.status}: ${response.statusText}`);
      }
  
      statusEl.textContent = `Top-up successful! TX ID: ${signedTx.id}`;
      statusEl.className = 'status-message success';
    } catch (error) {
      logDebug(`Top-up error: ${error.message}`);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'status-message error';
    }
  }
  
  async function grantControllerAccess() {
    const selectedProcessId = document.getElementById('arnsNames').value;
    const statusEl = document.getElementById('status');
    
    if (!projectWalletAddress) {
      alert('Please set a project wallet address.');
      statusEl.textContent = 'Error: Please set a project wallet address.';
      statusEl.className = 'status-message error';
      return;
    }
    
    if (!selectedProcessId) {
      alert('Please select an ARNS name.');
      statusEl.textContent = 'Error: Please select an ARNS name.';
      statusEl.className = 'status-message error';
      return;
    }
    
    if (!mainWalletConnected) {
      alert('Please connect your wallet first.');
      statusEl.textContent = 'Error: Please connect your wallet first.';
      statusEl.className = 'status-message error';
      return;
    }
    
    try {
      statusEl.innerHTML = '<span class="loading"></span> Granting controller access...';
      statusEl.className = 'status-message';
      
      if (!sdkLoaded) {
        await waitForSdkToLoad();
      }
      
      if (!window.arIO || !window.arIO.ANT) {
        throw new Error('ARIO SDK not loaded or initialized properly');
      }
      
      const selectedName = document.getElementById('arnsNames').options[document.getElementById('arnsNames').selectedIndex].textContent;
      logDebug(`Granting controller access to ${projectWalletAddress} for name ${selectedName} (process ${selectedProcessId})`);
      
      const ant = window.arIO.ANT.init({ processId: selectedProcessId, signer: window.arweaveWallet });
      await ant.addController({ controller: projectWalletAddress });
      
      statusEl.textContent = `Controller access granted to ${projectWalletAddress} for ARNS name "${selectedName}"!`;
      statusEl.className = 'status-message success';
    } catch (error) {
      console.error('Grant controller error:', error);
      logDebug(`Grant controller error: ${error.message}`);
      statusEl.textContent = `Error granting access: ${error.message}`;
      statusEl.className = 'status-message error';
    }
  }