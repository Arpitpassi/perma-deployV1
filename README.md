# Anantweb

Anantweb is a tool that makes it easy to deploy your applications or websites to the Arweave network, a decentralized storage platform where data is stored permanently. Our project belives in the idea of giving back the power of deploying hosting and using a website all in the hands of the developers themselves, so that they dont have rely on a server hosting their website that might crash or delete their content. With Arweave and Anantweb you have the power to let your work be immortalized and the entire process handled by you and only you with absolute ease.


With Anantweb, you can:

- Initialize a project and generate a wallet.
- Fund the wallet for deployments.
- Set up a custom domain using ARNS (Arweave Name Service).
- View your deployment history.

This README provides step-by-step instructions to get you started.

## Introduction

- *What is Arweave?*  
  Arweave is a decentralized network that stores data forever. Once uploaded, your content is permanently available on the web.

- *What is ARNS?*  
  ARNS (Arweave Name Service) lets you link a human-readable name (like "myapp") to your Arweave content, making it easier to access.

- *Why use PermaDeploy?*  
  PermaDeploy simplifies deploying to Arweave with a user-friendly interface and command-line tools, handling wallet setup, funding, and ARNS configuration.

## Prerequisites

Before you begin, make sure you have:

- A modern web browser (e.g., Chrome, Firefox).
- The [Wander wallet extension](https://www.wander.xyz/) (formerly ArConnect) installed in your browser.
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your system (version 18 or higher).

## Installation

Follow these steps to set up PermaDeploy:

1. *Clone the Repository*  
   Download the project files to your computer by cloning the repository or extracting the provided files.

2. *Install Dependencies for the Main Tool*  
   Open a terminal, navigate to the project directory (where the first package.json with "name": "perma-deploy" is located), and run:

   bash
   npm install
   

3. *Install Dependencies for the Website*  
   If there’s a separate website folder (containing the second package.json with "name": "website"), navigate to it and install its dependencies:

   bash
   cd website
   npm install
   

4. *Build the Website (Optional)*  
   If you’re using the provided HTML interface, build the necessary JavaScript bundles. From the main project directory, run:

   bash
   npm run build
   

   This creates a dist/aoconnect-bundle.js file used by the HTML interface.

5. *Serve the Website (Optional)*  
   To use the web interface, serve the HTML file (e.g., using a local server like npx serve or by opening it in a browser).

## Usage

PermaDeploy has two main components: a command-line tool (perma-deploy) and a web interface. Below are the steps to use the web interface, which guides you through the process.

### Step 1: Initialize Your Project

1. *Open the Web Interface*  
   Open the provided HTML file (index.html) in your browser.

2. *Enter Project Details*  
   In the "Initialize Your Project" section, fill in:
   - *Build Command*: How your project builds (e.g., npm run build).
   - *Branch to Deploy*: The git branch to deploy (e.g., main).
   - *ARNS Name* (optional): A custom domain name (e.g., myapp).
   - *ARNS Undername* (optional): A subdomain (e.g., dev).

3. *Generate Wallet and Command*  
   Click *"GENERATE WALLET AND COMMAND"*. You’ll see:
   - A command to run in your project’s root directory.
   - A project wallet address.
   - A seed phrase (in base64 format).

4. *Copy and Run the Command*  
   - Click *"COPY COMMAND"* and paste it into your terminal, in your project’s root directory.
   - Run the command to set up your project for deployment (e.g., npx perma-deploy-init --build "npm run build" --branch "main" --seed "your-seed-here").
   - Example output might look like:
     bash
     npx perma-deploy-init --build "npm run build" --branch "main" --seed "SGVsbG8gV29ybGQ="
     

5. *Save Wallet Details*  
   - Copy the *wallet address* and *seed phrase* (using the "COPY" buttons) and store them securely. You’ll need them later.

6. *Proceed*  
   Click *"PROCEED TO STEP 2"* to move forward.

*Note*: Files under 100KB can be deployed for free without funding. Test your setup first!

### Step 2: Fund Wallet and Setup ARNS

1. *Connect Your Wander Wallet*  
   In the "Fund Wallet and Setup ARNS" section, click *"CONNECT WANDER WALLET"* to link your personal Wander wallet.

2. *Fund the Project Wallet*  
   - Ensure your Wander wallet has at least 0.1 AR.
   - Click *"TOP UP PROJECT WALLET (0.1 AR)"* to send 0.1 AR to the project wallet generated in Step 1.

3. *Set Up ARNS (Optional)*  
   - If you entered an ARNS name in Step 1, select it from the dropdown (it appears after connecting your wallet).
   - Click *"GRANT CONTROLLER ACCESS"* to let the project wallet manage the ARNS record.

4. *Deploy Your Project*  
   - After funding, run this command in your project’s root directory to deploy:
     bash
     npx perma-deploy-deploy
     
   - Repeat this command whenever you want to deploy a new version.

## Troubleshooting

- *Wallet Won’t Connect*  
  Ensure the Wander wallet extension is installed and enabled. Refresh the page and try again.

- *Deployment Fails*  
  Check that the project wallet has enough AR (at least 0.1 AR for larger files). Top it up if needed.

- *ARNS Not Working*  
  Verify the ARNS name is registered in your Wander wallet and that controller access was granted.

## Contributing

We welcome contributions! If you have ideas or fixes:
1. Fork the repository.
2. Make your changes.
3. Submit a pull request or open an issue on the project’s GitHub page.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details (if provided; otherwise, assumed MIT based on common practice).

