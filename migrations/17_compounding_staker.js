const CompoundingStaker = artifacts.require("CompoundingStaker");
const e18 = '000000000000000000';

module.exports = function(deployer) {
    require('dotenv').config();
    const coreAddress = process.env.MAINNET_CORE;

    deployer.then(function() {
        return deployer.deploy(
          CompoundingStaker,
          process.env.MAINNET_FEI,
          process.env.MAINNET_TRIBE,
          process.env.MAINNET_FEI_TRIBE_PAIR,
          process.env.MAINNET_UNISWAP_ROUTER,
          process.env.MAINNET_FEI_STAKING_REWARDS,
          '0x6ef71cA9cD708883E129559F5edBFb9d9D5C6148' // eswak.eth
        );
    }).then(function(compoundingStaker) {
      console.log('MAINNET_COMPOUNDING_STAKER=' + compoundingStaker.address);
    });
}
