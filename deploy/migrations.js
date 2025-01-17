import mainnetAddressesV1 from '../contract-addresses/mainnetAddresses.json';

const { web3 } = require('hardhat');

// Run the deployment for DEPLOY_FILE
async function main() {
  const proposalName = process.env.DEPLOY_FILE;

  if (!proposalName) {
    throw new Error('DEPLOY_FILE env variable not set');
  }

  const deployAddress = (await web3.eth.getAccounts())[0];

  const mainnetAddresses = {};
  Object.keys(mainnetAddressesV1).map((key) => {
    mainnetAddresses[key] = mainnetAddressesV1[key].address;
    return true;
  });

  const { deploy } = await import(`./${proposalName}`);
  await deploy(deployAddress, mainnetAddresses, true);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
