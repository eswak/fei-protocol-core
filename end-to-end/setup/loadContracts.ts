import mainnetAddresses from '../../contract-addresses/mainnetAddresses.json'
import { artifacts } from 'hardhat'
import { MainnetContractAddresses, MainnetContracts } from './types';

const contractArtifacts = {}

/**
 * Gets all contract instances for a set of contract names and their
 * addresses
 */
export async function getContracts(contractAddresses: MainnetContractAddresses): Promise<MainnetContracts> {
  // Array of all deployed contracts
  const deployedContracts = await Promise.all(Object.keys(contractAddresses).map(async contractName => {
    const web3Contract = await getContract(contractName, contractAddresses[contractName])
    if (web3Contract) {
      return [contractName.replace('Address', ''), web3Contract];
    }
    return null;
  }))
  

  // Object with mapping between contract name and contract instance
  const deployedContractObjects = deployedContracts.reduce((accumulator, currentDeployedContracts) => {
    if (currentDeployedContracts) {
      const [contractName, contractInstance] = currentDeployedContracts;
      accumulator[contractName] = contractInstance;
    }
    return accumulator
  })
  // TODO: Figure out why core isn't getting added to the map. Temporary fix to just add it in manually below
  deployedContractObjects['core'] = await getContract('coreAddress', contractAddresses['coreAddress'])
  return deployedContractObjects as unknown as MainnetContracts
}

/**
 * Gets all contract instances for a set of contract names and their
 * addresses
 */
 export function getContractAddresses(contracts: MainnetContracts): MainnetContractAddresses {
  // Array of all deployed contracts
  const deployedContractAddresses = Object.keys(contracts).map(contractName => {
    return [contractName + 'Address', contracts[contractName].address]
  })
  
  // Object with mapping between contract name and contract instance
  const deployedContractAddressObjects = deployedContractAddresses.reduce((accumulator, currentDeployedContracts) => {
    const [contractName, contractAddress] = currentDeployedContracts;
    accumulator[contractName] = contractAddress;
    return accumulator
  })

  return deployedContractAddressObjects as unknown as MainnetContractAddresses
}

/**
 * Factory function to get the web3 instantiation of a contract
 */
export async function getContract(contractName: string, contractAddress: string) {
  const artifact = mainnetAddresses[contractName].artifact;
  if (!artifact) {
    return null;
  }
  if (!contractArtifacts[artifact]) {
    contractArtifacts[artifact] = artifacts.require(artifact);
  }
  return contractArtifacts[artifact].at(contractAddress)
}