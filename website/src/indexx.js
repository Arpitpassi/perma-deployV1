async function generateCommand() {
  try {
    const installCommand = document.getElementById('installCommand').value || 'npm install perma-deployV1';
    const buildCommand = document.getElementById('buildCommand').value || 'npm run build';
    const branch = document.getElementById('branch').value || 'main';
    const arnsSelect = document.getElementById('arnsNames');
    const selectedProcessId = arnsSelect.value;
    const undername = document.getElementById('undername').value || '';

    const seedArray = window.crypto.getRandomValues(new Uint8Array(32));
    walletSeed = btoa(String.fromCharCode.apply(null, seedArray));

    const initCommand = `npx perma-deploy-init --build "${buildCommand}" --branch "${branch}"${selectedProcessId ? ` --ant-process "${selectedProcessId}"` : ''}${undername ? ` --undername "${undername}"` : ''} --seed "${walletSeed}"`;
    
    generatedCommand = `#Initialize your project\n${initCommand}`;

    document.getElementById('commandOutput').textContent = generatedCommand;
    document.getElementById('seedOutput').textContent = `Base64 Seed: ${walletSeed}`;
  } catch (error) {
    console.error('Error generating command:', error);
    logDebug(`Error generating command: ${error.message}`);
    document.getElementById('commandOutput').textContent = `Error: ${error.message}`;
    showStatusMessage('status', `Error: ${error.message}`, 'error');
  }
}

function copyCommand() {
  navigator.clipboard.writeText(generatedCommand)
    .then(() => alert('Command copied!'))
    .catch(err => {
      console.error('Failed to copy command:', err);
      showStatusMessage('status', `Error: Failed to copy command`, 'error');
    });
}

function copySeed() {
  navigator.clipboard.writeText(walletSeed)
    .then(() => alert('Seed phrase copied! Keep it safe!'))
    .catch(err => {
      console.error('Failed to copy seed:', err);
      showStatusMessage('status', `Error: Failed to copy seed`, 'error');
    });
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

    showStatusMessage('status', `Top-up successful! TX ID: ${signedTx.id}`, 'success');
  } catch (error) {
    logDebug(`Top-up error: ${error.message}`);
    showStatusMessage('status', `Error: ${error.message}`, 'error');
  }
}

async function grantControllerAccess() {
  const selectedProcessId = document.getElementById('arnsNames').value;
  
  if (!projectWalletAddress) {
    showStatusMessage('status', 'Error: Please set a project wallet address.', 'error');
    return;
  }
  
  if (!selectedProcessId) {
    showStatusMessage('status', 'Error: Please select an ARNS name.', 'error');
    return;
  }
  
  if (!mainWalletConnected) {
    showStatusMessage('status', 'Error: Please connect your wallet first.', 'error');
    return;
  }
  
  try {
    document.getElementById('status').innerHTML = '<span class="loading"></span> Granting controller access...';
    document.getElementById('status').className = 'status-message';
    
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
    
    showStatusMessage('status', `Controller access granted to ${projectWalletAddress} for ARNS name "${selectedName}"!`, 'success');
  } catch (error) {
    console.error('Grant controller error:', error);
    logDebug(`Grant controller error: ${error.message}`);
    showStatusMessage('status', `Error granting access: ${error.message}`, 'error');
  }
}

// Theme-related JavaScript
function initParticleBackground() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];

  for (let i = 0; i < 20; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 3 + 1,
      color: '#fff',
      speed: Math.random() * 2 + 1,
      direction: Math.random() * Math.PI * 2
    });
  }

  function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach(particle => {
      // Draw faint blue dust cloud ring
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(144, 224, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw white particle
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = particle.color;
      ctx.fill();

      // Update position
      particle.x += Math.cos(particle.direction) * particle.speed;
      particle.y += Math.sin(particle.direction) * particle.speed;

      // Bounce off edges
      if (particle.x < 0 || particle.x > canvas.width) {
        particle.direction = Math.PI - particle.direction;
      }
      if (particle.y < 0 || particle.y > canvas.height) {
        particle.direction = -particle.direction;
      }
    });

    requestAnimationFrame(animate);
  }

  animate();
}

function nextStep(currentStep) {
  const steps = document.querySelectorAll('.form-step');
  if (currentStep < steps.length - 1) {
    steps[currentStep].classList.remove('active');
    steps[currentStep + 1].classList.add('active');
  }
}

function goBack(currentStep) {
  const steps = document.querySelectorAll('.form-step');
  if (currentStep === 0 || currentStep === 4) {
    // First step or command output: return to main screen
    document.getElementById('configForm').style.display = 'none';
    document.getElementById('commandOutputDiv').style.display = 'none';
    document.getElementById('metaTitle').style.display = 'block';
    document.getElementById('subtitle').style.display = 'block';
    document.getElementById('particleCanvas').style.display = 'none';
    toggleBackgroundBlur(false);
  } else {
    // Go to previous step
    steps[currentStep].classList.remove('active');
    steps[currentStep - 1].classList.add('active');
  }
}

function closeWindow() {
  document.getElementById('configForm').style.display = 'none';
  document.getElementById('commandOutputDiv').style.display = 'none';
  document.getElementById('metaTitle').style.display = 'block';
  document.getElementById('subtitle').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  toggleBackgroundBlur(false);
}

function generateCommandWrapper() {
  generateCommand();
  document.getElementById('configForm').style.display = 'none';
  document.getElementById('commandOutputDiv').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'none';
  toggleBackgroundBlur(true);
}

function goToWalletOperations() {
  document.getElementById('commandOutputDiv').style.display = 'none';
  document.getElementById('configForm').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  toggleBackgroundBlur(true);
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 3); // Wallet operations step
  });
}

window.addEventListener('load', initParticleBackground);

document.getElementById('generateCommandBtn').addEventListener('click', function() {
  document.getElementById('metaTitle').style.display = 'none';
  document.getElementById('subtitle').style.display = 'none';
  document.getElementById('configForm').style.display = 'block';
  document.getElementById('particleCanvas').style.display = 'block';
  document.querySelectorAll('.form-step').forEach((step, index) => {
    step.classList.toggle('active', index === 0);
  });
  toggleBackgroundBlur(true);
});

window.addEventListener('resize', function() {
  const canvas = document.getElementById('particleCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});