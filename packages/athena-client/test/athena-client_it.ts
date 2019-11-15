import fs from 'fs';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
const assert = chai.assert;

import { Account, AthenaClient, Amount } from '../src';

const endpoint = "localhost:7845";
const timeout = 7000;
const readFile = (path: string) => fs.readFileSync(__dirname + path, 'utf8');

const richEncrypted = "47aHppxcBPDTn2ZhbbY82nzLq7kuQo6c5UKHuCLG4Tam2VqKqYXbcUbyBdGDmdFhg8b7xrciP";
const richPassword = "genesispw";

const executeFunc = "set";
const queryFunc = "get";
const newFunc = "newGet";
const feeLimit = 10000;

describe('AthenaClient', () => {

  describe('Fetch', () => {

    it('should fetch blockchain status', async () => {
      // given
      const athenaClient = new AthenaClient(endpoint);

      // when
      const status = await athenaClient.getBlockchainStatus();

      // then
      assert.isNotNull(status.bestBlockHash);
      assert.isNotNull(status.bestHeight);
    }).timeout(timeout);

    it('should fetch account state', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      // when
      const state = await athenaClient.getState(account.address);

      // then
      assert.isNotNull(state.nonce);
      assert.isNotNull(state.balance);
    }).timeout(timeout);

    it('should get already deployed contract interface successfully', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const deployment = { payload: payload };
      const deployed = await athenaClient.deploy(account, deployment, feeLimit).then(r => r.contractAddress);

      // when
      const contractInterface = await athenaClient.getContractInterface(deployed);

      // then
      assert.equal(contractInterface.address, deployed);
    }).timeout(timeout);

  })

  describe('Deploy', () => {

    it('should deploy successfully', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const deployment = { payload: payload };

      // when
      const deployResult = await athenaClient.deploy(account, deployment, 0);

      // then
      const contractInterface = deployResult.contractInterface;
      assert.equal(deployResult.status, "CREATED")
      assert.isNotNull(contractInterface);
    }).timeout(timeout);

    it('should deploy with args applied successfully', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const key = "key";
      const deployIntVal = 1;
      const deployStringVal = "value1";
      const deployment = {
        payload: payload,
        args: [ key, deployIntVal, deployStringVal],
      };

      // when
      const deployResult = await athenaClient.deploy(account, deployment, feeLimit);
      const contractInterface = deployResult.contractInterface;
      const query = contractInterface.getInvocation(queryFunc, key);
      const queryResult = await athenaClient.query(query);

      // then
      assert.equal(queryResult.intVal, deployIntVal);
      assert.equal(queryResult.stringVal, deployStringVal);
    }).timeout(timeout);

    it('should deploy with amount applied successfully', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const amount = "1000";
      const deployment = {
        payload: payload,
        amount: amount
      };

      // when
      const deployResult = await athenaClient.deploy(account, deployment, feeLimit);

      // then
      const contractAddress = deployResult.contractAddress;
      const state = await athenaClient.getState(contractAddress);
      const mustBeSmallerThen = new Amount(amount, "aer");
      assert.isTrue(mustBeSmallerThen.compare(state.balance) <= 0);
    }).timeout(timeout);
  })

  // should run in private mode (set in genesis.json)
  describe('Redeploy', () => {

    it('should function added on redeploy', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const deployment = {
        payload: payload,
      };
      const beforeAbi = await athenaClient.deploy(account, deployment, feeLimit).then(r => r.contractInterface);

      // when
      const newPayload = readFile('/res/payable-with-args-with-newfunc.payload');
      const redeployment = {
        payload: newPayload,
      };
      const afterAbi = await athenaClient.redeploy(account, beforeAbi.address, redeployment, feeLimit)
          .then(r => r.contractInterface);

      // then
      assert.equal(afterAbi.address, beforeAbi.address);
      assert.isTrue(typeof beforeAbi.getInvocation(newFunc) === "undefined");
      assert.isTrue(typeof afterAbi.getInvocation(newFunc) !== "undefined");
    }).timeout(timeout);

  });

  describe('Execute', () => {

    it('should execute contract', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const key = "key";
      const deployIntVal = 1;
      const deployStringVal = "value1";
      const payload = readFile('/res/payable-with-args.payload');
      const deployment = {
        payload: payload,
        args: [ key, deployIntVal, deployStringVal],
      };
      const contractInterface = await athenaClient.deploy(account, deployment, feeLimit).then(r => r.contractInterface);

      // when
      const executeIntVal = 2;
      const executeStringVal = "value2";
      const execution = contractInterface.getInvocation(executeFunc, key, executeIntVal, executeStringVal);
      await athenaClient.execute(account, execution, feeLimit);

      // then
      const query = contractInterface.getInvocation(queryFunc, key);
      const queryResult = await athenaClient.query(query);
      assert.equal(queryResult.intVal, executeIntVal);
      assert.equal(queryResult.stringVal, executeStringVal);
    }).timeout(timeout);

    it('should execute contract with amount', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/payable-with-args.payload');
      const deployment = { payload: payload };
      const contractInterface = await athenaClient.deploy(account, deployment, feeLimit).then(r => r.contractInterface);

      // when
      const key = "key"
      const executeIntVal = 2;
      const executeStringVal = "value2";
      const amount = "1000";
      const execution = contractInterface.getInvocation(executeFunc, key, executeIntVal, executeStringVal);
      execution.amount = amount;
      await athenaClient.execute(account, execution, feeLimit);

      // then
      const state = await athenaClient.getState(contractInterface.address);
      const mustBeSmallerThen = new Amount(amount, "aer");
      assert.isTrue(mustBeSmallerThen.compare(state.balance) <= 0);
    }).timeout(timeout);

    // should run in private mode (set in genesis.json)
    it('should execute contract with delegation fee', async () => {
      // given
      const account = await Account.from(richEncrypted, richPassword);
      const athenaClient = new AthenaClient(endpoint);

      const payload = readFile('/res/fee-delegation.payload');
      const amount = "1000000000000000000000000";
      const deployment = {
        payload: payload,
        amount: amount
      };
      const contractInterface = await athenaClient.deploy(account, deployment, feeLimit).then(r => r.contractInterface);

      // when
      const key = "key";
      const value = "value";
      const execution = contractInterface.getInvocation(executeFunc, key, value);
      execution.feeDelegation = true;
      const beforeState = await athenaClient.getState(account.address);
      await athenaClient.execute(account, execution, feeLimit);

      // then
      const afterState = await athenaClient.getState(account.address);
      assert.isTrue(afterState.balance.equal(beforeState.balance));
    }).timeout(timeout);

  });

});