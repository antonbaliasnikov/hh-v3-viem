// test/Counter.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { defineChain, type Abi } from "viem";
import CounterArtifact from "../artifacts/contracts/Counter.sol/Counter.json" assert { type: "json" };

export const zksyncos = defineChain({
  id: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 270,
  name: process.env.NETWORK_NAME || "ZKsyncOS",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_URL || ""] },
    public: { http: [process.env.RPC_URL || ""] },
  },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Counter", async function () {
  // Connect Hardhat to the target network (e.g. "ZKsyncOS").
  const { viem } = await network.connect(
    process.env.NETWORK_NAME || "ZKsyncOS"
  );

  // ✅ Let Hardhat’s viem plugin provide clients for the connected network.
  const publicClient = await viem.getPublicClient({ chain: zksyncos });
  const [wallet] = await viem.getWalletClients({ chain: zksyncos });
  if (!wallet)
    throw new Error("No wallet client. Set PRIVATE_KEY for zksyncOS.");

  const abi = CounterArtifact.abi as Abi;
  const bytecode = CounterArtifact.bytecode as `0x${string}`;

  it("Should emit the Increment event when calling the inc() function", async function () {
    // Deploy
    const deployHash = await wallet.deployContract({ abi, bytecode, args: [] });
    const deployRcpt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
      pollingInterval: 500,
    });

    const counterAddr = deployRcpt.contractAddress!;
    const fromBlock = deployRcpt.blockNumber!;

    // Optional: give the node a short beat after deployment.
    await sleep(150);

    // Simulate -> write (pins block/account context & avoids flaky preflight).
    const sim = await publicClient.simulateContract({
      address: counterAddr,
      abi,
      functionName: "inc",
      args: [],
      account: wallet.account,
      blockTag: "latest",
    });
    const txHash = await wallet.writeContract(sim.request);
    await publicClient.waitForTransactionReceipt({
      hash: txHash,
      pollingInterval: 500,
    });

    // Fetch events starting from the deploy block.
    const events = await publicClient.getContractEvents({
      address: counterAddr,
      abi,
      eventName: "Increment",
      fromBlock,
      strict: true,
    });

    assert.ok(events.length >= 1, "expected at least one Increment event");
    const lastBy = (events.at(-1)!.args as any).by as bigint;
    assert.equal(lastBy, 1n);
  });

  it("The sum of the Increment events should match the current value", async function () {
    // Deploy
    const deployHash = await wallet.deployContract({ abi, bytecode, args: [] });
    const deployRcpt = await publicClient.waitForTransactionReceipt({
      hash: deployHash,
      pollingInterval: 100,
    });

    const counterAddr = deployRcpt.contractAddress!;
    const fromBlock = deployRcpt.blockNumber!;

    // Optional: small pause post-deploy.
    await sleep(150);

    // Do 10 increments with simulate -> write.
    for (let i = 1n; i <= 10n; i++) {
      const sim = await publicClient.simulateContract({
        address: counterAddr,
        abi,
        functionName: "incBy",
        args: [i],
        account: wallet.account,
        blockTag: "latest",
      });
      const h = await wallet.writeContract(sim.request);
      await publicClient.waitForTransactionReceipt({
        hash: h,
        pollingInterval: 100,
      });
    }

    // Read all Increment events since deploy.
    const events = await publicClient.getContractEvents({
      address: counterAddr,
      abi,
      eventName: "Increment",
      fromBlock,
      strict: true,
    });

    let total = 0n;
    for (const e of events) total += (e.args as any).by as bigint;

    // Read the current value from the contract.
    const current = (await publicClient.readContract({
      address: counterAddr,
      abi,
      functionName: "x",
    })) as bigint;

    assert.equal(total, current);
  });
});
