const {
  web3,
  BN,
  expectRevert,
  balance,
  expect,
  getAddresses,
  getCore,
} = require('../helpers');
  
const EthReserveStabilizer = artifacts.require('EthReserveStabilizer');
const Fei = artifacts.require('Fei');
const MockWeth = artifacts.require('MockWeth');
const MockOracle = artifacts.require('MockOracle');
const MockPCVDeposit = artifacts.require('MockEthUniswapPCVDeposit');

describe('EthReserveStabilizer', function () {
  let userAddress;
  let governorAddress;
  let minterAddress;
  let pcvControllerAddress;

  beforeEach(async function () {
    ({
      userAddress,
      governorAddress,
      minterAddress,
      pcvControllerAddress,
    } = await getAddresses());
    
    this.core = await getCore(true);
  
    this.fei = await Fei.at(await this.core.fei());
    this.weth = await MockWeth.new();
    this.oracle = await MockOracle.new(400); // 400:1 oracle price
    this.pcvDeposit = await MockPCVDeposit.new(userAddress);

    this.reserveStabilizer = await EthReserveStabilizer.new(this.core.address, this.oracle.address, this.oracle.address, '9000', this.weth.address);

    await this.core.grantBurner(this.reserveStabilizer.address, {from: governorAddress});

    this.initialBalance = new BN('1000000000000000000');
    await web3.eth.sendTransaction({from: userAddress, to: this.reserveStabilizer.address, value: this.initialBalance});

    await this.fei.mint(userAddress, 40000000, {from: minterAddress});  
  });
  
  describe('Exchange', function() {
    describe('Enough FEI', function() {
      it('exchanges for appropriate amount of ETH', async function() {
        const reserveBalanceBefore = await balance.current(this.reserveStabilizer.address);
        await this.reserveStabilizer.exchangeFei(40000000, {from: userAddress});
        const reserveBalanceAfter = await balance.current(this.reserveStabilizer.address);

        this.expectedOut = new BN('90000');
        expect(reserveBalanceBefore.sub(reserveBalanceAfter)).to.be.bignumber.equal(this.expectedOut);

        expect(await this.fei.balanceOf(userAddress)).to.be.bignumber.equal(new BN('0'));
        expect(await this.reserveStabilizer.balance()).to.be.bignumber.equal(this.initialBalance.sub(this.expectedOut));
      });
    });

    describe('Double Oracle price', function() {
      it('exchanges for appropriate amount of ETH', async function() {
        await this.oracle.setExchangeRate('800');

        const reserveBalanceBefore = await balance.current(this.reserveStabilizer.address);
        await this.reserveStabilizer.exchangeFei(40000000, {from: userAddress});
        const reserveBalanceAfter = await balance.current(this.reserveStabilizer.address);

        this.expectedOut = new BN('45000');
        expect(reserveBalanceBefore.sub(reserveBalanceAfter)).to.be.bignumber.equal(this.expectedOut);

        expect(await this.fei.balanceOf(userAddress)).to.be.bignumber.equal(new BN('0'));
        expect(await this.reserveStabilizer.balance()).to.be.bignumber.equal(this.initialBalance.sub(this.expectedOut));
      });
    });

    describe('Higher usd per fei', function() {
      it('exchanges for appropriate amount of ETH', async function() {
        await this.reserveStabilizer.setUsdPerFeiRate('9500', {from: governorAddress});

        const reserveBalanceBefore = await balance.current(this.reserveStabilizer.address);
        await this.reserveStabilizer.exchangeFei(40000000, {from: userAddress});
        const reserveBalanceAfter = await balance.current(this.reserveStabilizer.address);

        this.expectedOut = new BN('95000');
        expect(reserveBalanceBefore.sub(reserveBalanceAfter)).to.be.bignumber.equal(this.expectedOut);

        expect(await this.fei.balanceOf(userAddress)).to.be.bignumber.equal(new BN('0'));
        expect(await this.reserveStabilizer.balance()).to.be.bignumber.equal(this.initialBalance.sub(this.expectedOut));
      });
    });

    describe('Not Enough FEI', function() {
      it('reverts', async function() {
        await expectRevert(this.reserveStabilizer.exchangeFei(50000000, {from: userAddress}), 'ERC20: burn amount exceeds balance');
      });
    });

    describe('Not Enough ETH', function() {
      it('reverts', async function() {
        await this.fei.mint(userAddress, new BN('4000000000000000000000000000'), {from: minterAddress});  
        await expectRevert(this.reserveStabilizer.exchangeFei(new BN('4000000000000000000000000000'), {from: userAddress}), 'revert');
      });
    });

    describe('Paused', function() {
      it('reverts', async function() {
        await this.reserveStabilizer.pause({from: governorAddress});
        await expectRevert(this.reserveStabilizer.exchangeFei(new BN('400000'), {from: userAddress}), 'Pausable: paused');
      });
    });
  });
  
  describe('Deposit', function() {
    it('unwraps WETH', async function() {
      await this.weth.deposit({value: '10000'});
      await this.weth.mint(this.reserveStabilizer.address, '10000');
      const reserveBalanceBefore = new BN(await balance.current(this.reserveStabilizer.address));
      await this.reserveStabilizer.deposit();

      expect(await web3.eth.getBalance(this.reserveStabilizer.address)).to.be.equal(reserveBalanceBefore.add(new BN('10000')).toString());
      expect(await this.weth.balanceOf(this.reserveStabilizer.address)).to.be.bignumber.equal('0');
    });
  });

  describe('Withdraw', function() {
    it('enough eth succeeds', async function() {
      const reserveBalanceBefore = await balance.current(this.reserveStabilizer.address);
      const userBalanceBefore = await balance.current(userAddress);

      await this.reserveStabilizer.withdraw(userAddress, '10000', {from: pcvControllerAddress});
      const reserveBalanceAfter = await balance.current(this.reserveStabilizer.address);
      const userBalanceAfter = await balance.current(userAddress);

      expect(reserveBalanceBefore.sub(reserveBalanceAfter)).to.be.bignumber.equal(new BN('10000'));
      expect(userBalanceAfter.sub(userBalanceBefore)).to.be.bignumber.equal(new BN('10000'));
    });

    it('not enough eth reverts', async function() {
      await expectRevert(this.reserveStabilizer.withdraw(userAddress, '10000000000000000000', {from: pcvControllerAddress}), 'revert');
    });

    it('non pcvController', async function() {
      await expectRevert(this.reserveStabilizer.withdraw(userAddress, '10000', {from: userAddress}), 'CoreRef: Caller is not a PCV controller');
    });
  });

  describe('Set USD per FEI', function() {
    it('governor succeeds', async function() {
      await this.reserveStabilizer.setUsdPerFeiRate('10000', {from: governorAddress});
      expect(await this.reserveStabilizer.usdPerFeiBasisPoints()).to.be.bignumber.equal(new BN('10000'));
    });

    it('non-governor reverts', async function() {
      await expectRevert(this.reserveStabilizer.setUsdPerFeiRate('10000', {from: userAddress}), 'CoreRef: Caller is not a governor');
    });

    it('too high usd per fei reverts', async function() {
      await expectRevert(this.reserveStabilizer.setUsdPerFeiRate('10001', {from: governorAddress}), 'ReserveStabilizer: Exceeds bp granularity');
    });
  });
});
