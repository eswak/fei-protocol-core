const {
  userAddress,
  secondUserAddress,
  minterAddress,
  governorAddress,
  expectEvent,
  expectRevert,
  web3,
  time,
  expect,
  contract,
  getCore
} = require('../helpers');

const M = '000000';
const e18 = '000000000000000000';
const CompoundingStaker = contract.fromArtifact('CompoundingStaker');
const Fei = contract.fromArtifact('Fei');
const Tribe = contract.fromArtifact('Tribe');
const FeiStakingRewards = contract.fromArtifact('FeiStakingRewards');
const MockERC20 = contract.fromArtifact('MockERC20');
const MockRouter = contract.fromArtifact('MockRouter');
const MockPair = contract.fromArtifact('MockUniswapV2PairLiquidity');

describe('CompoundingStaker', function () {
  beforeEach(async function () {
    this.core = await getCore(true);
    this.fei = await Fei.at(await this.core.fei());
    this.tribe = await Tribe.at(await this.core.tribe());
    this.pair = await MockPair.new(this.fei.address, this.tribe.address);
    await this.pair.set('200'+M+e18, '250'+M+e18, '335'+M+e18, {from:minterAddress}); // 200M FEI / 250M TRIBE with 335M liquidity
    this.router = await MockRouter.new(this.pair.address);

    this.window = '100';
    this.rewardAmount = '200'+M+e18;
    this.rewards = await FeiStakingRewards.new(
      governorAddress,
      this.tribe.address,
      this.pair.address,
      this.window
    );

    this.staker = await CompoundingStaker.new(
      this.fei.address,
      this.tribe.address,
      this.pair.address,
      this.router.address,
      this.rewards.address,
      userAddress, // owner
      {from: userAddress}
    );

    // mint LP tokens for users
    await this.pair.mintAmount(userAddress, '1000'+e18);
    await this.pair.mintAmount(secondUserAddress, '4000'+e18);

    // fill uniswap pair : 0.8 TRIBE/FEI
    await this.fei.mint(this.pair.address, '200'+M+e18, {from: minterAddress});
    await this.core.allocateTribe(this.pair.address, '250'+M+e18, {from: governorAddress});

    // 200M staking rewards
    await this.core.allocateTribe(this.rewards.address, this.rewardAmount, {from: governorAddress});
    await this.rewards.notifyRewardAmount(this.rewardAmount, {from: governorAddress})
  });

  describe('Getters', function() {
    it('owner()', async function() {
      expect(await this.staker.owner()).to.be.equal(userAddress);
    });
    it('staked() without harvest', async function() {
      expect(await this.staker.staked()).to.be.bignumber.equal('0');
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.staker.staked()).to.be.bignumber.equal('1000'+e18);
    });
    it('staked() after harvest', async function() {
      expect(await this.staker.staked()).to.be.bignumber.equal('0');
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      await this.staker.deposit('1000'+e18, {from: userAddress});
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('1000000000000000010000');
    });
  });

  describe('withdrawERC20()', function() {
    it('as owner', async function() {
      await this.fei.mint(this.staker.address, '12345', {from: minterAddress});
      expect(await this.fei.balanceOf(userAddress)).to.be.bignumber.equal('0');
      await this.staker.withdrawERC20(this.fei.address, '12345', {from:userAddress});
      expect(await this.fei.balanceOf(userAddress)).to.be.bignumber.equal('12345');
    });
    it('as anyone', async function() {
      await expectRevert(
        this.staker.withdrawERC20(this.fei.address, '12345'),
        'Ownable: caller is not the owner.'
      );
    });
  });

  describe('Staking functions', function() {
    describe('deposit()', function() {
      it('one depositor, no harvest', async function() {
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
      });
      it('two depositors (2nd before harvest)', async function() {
        // first depositor
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // second depositor
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('4000'+e18, {from: secondUserAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('5000'+e18);
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
      });
      it('two depositors (2nd after harvest)', async function() {
        // first depositor
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // harvest
        await time.increase('1');
        await this.staker.harvest({from: userAddress});
        // second depositor
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('4000'+e18, {from: secondUserAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('5000000000000000010000'); // 5000 + 1 harvest
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('3999999999999999960000');
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
      });
    });
    describe('withdraw()', function() {
      it('one depositor, no harvest', async function() {
        // deposit
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // withdraw
        await this.staker.withdraw('1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('0');
      });
      it('one depositor, harvest, partial withdraw', async function() {
        // deposit
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // harvest
        await time.increase('1');
        await this.staker.harvest({from: userAddress});
        // withdraw
        await this.staker.withdraw('500'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('500'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('500000000000000005000');
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('500000000000000005000');
      });
      it('two depositors (2nd before harvest)', async function() {
        // first depositor
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // second depositor
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('4000'+e18, {from: secondUserAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('5000'+e18);
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        // first withdraw
        await this.staker.withdraw('1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('4000'+e18);
        // second withdraw
        await this.staker.withdraw('4000'+e18, {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('0');
      });
      it('two depositors (2nd after harvest)', async function() {
        // first depositor
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('1000'+e18, {from: userAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
        // harvest
        await time.increase('1');
        await this.staker.harvest({from: userAddress});
        // second depositor
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        await this.staker.deposit('4000'+e18, {from: secondUserAddress});
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('5000000000000000010000'); // 5000 + 1 harvest
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('3999999999999999960000');
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        // first withdraw
        await this.staker.withdraw('1000'+e18, {from: userAddress});
        expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
        expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000000000000000010000');
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('4000'+e18);
        // second withdraw
        await this.staker.withdraw('3999999999999999960000', {from: secondUserAddress});
        expect(await this.staker.balanceOf(secondUserAddress)).to.be.bignumber.equal('0');
        expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000'+e18);
        expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('0');
      });
    });
  });

  describe('Harvesting', function() {
    it('should compound LP tokens', async function() {
      // deposit
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
      await this.staker.deposit('1000'+e18, {from: userAddress});
      expect(await this.rewards.balanceOf(this.staker.address)).to.be.bignumber.equal('1000'+e18);
      expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0');
      // harvest 1
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('1000000000000000010000');
      // harvest 2
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('1000000000000000020000');
    });
  });

  describe('Complete scenario', async function() {
    it('2 depositors, 4 harvests', async function() {
      // first depositor
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18);
      expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('0');
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      await this.staker.deposit('1000'+e18, {from: userAddress});
      expect(await this.staker.balanceOf(userAddress)).to.be.bignumber.equal('1000'+e18); // minted shares
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('0'); // user does not have LP tokens anymore
      expect(await this.staker.totalSupply()).to.be.bignumber.equal('1000'+e18); // total shares
      expect(await this.staker.staked()).to.be.bignumber.equal('1000'+e18); // staked for rewards
      // time passes
      await time.increase('1');
      // harvest
      await this.staker.harvest({from: userAddress});
      // first user withdraw
      await this.staker.withdraw('1000'+e18, {from: userAddress});
      // note: addLiquidity in MockRouter just adds 10k liquidity on every deposits
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000000000000000010000');
      // second depositor & first depositor redeposit
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      await this.staker.deposit('1000'+e18, {from: userAddress});
      await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
      await this.staker.deposit('4000'+e18, {from: secondUserAddress});
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      await this.staker.withdraw('1000'+e18, {from: userAddress});
      await this.staker.withdraw('4000'+e18, {from: secondUserAddress});
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000000000000000012000');
      expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000000000000000008000');
      // asynchronous deposit
      await this.pair.approve(this.staker.address, '1000'+e18, {from: userAddress});
      await this.staker.deposit('1000'+e18, {from: userAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('1000'+e18);
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      await this.pair.approve(this.staker.address, '4000'+e18, {from: secondUserAddress});
      await this.staker.deposit('4000'+e18, {from: secondUserAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('5000000000000000010000'); // 1000 + 4000 + 1 harvest
      await time.increase('1');
      await this.staker.harvest({from: userAddress});
      expect(await this.staker.staked()).to.be.bignumber.equal('5000000000000000020000'); // 1000 + 4000 + 2 harvest
      await this.staker.withdraw('1000'+e18, {from: userAddress});
      await this.staker.withdraw('3999999999999999960000', {from: secondUserAddress});
      expect(await this.pair.balanceOf(userAddress)).to.be.bignumber.equal('1000000000000000024000');
      expect(await this.pair.balanceOf(secondUserAddress)).to.be.bignumber.equal('4000000000000000016000');
      expect(await this.staker.staked()).to.be.bignumber.equal('0');
    });
  });
});
