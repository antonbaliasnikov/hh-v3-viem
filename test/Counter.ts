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
    public:  { http: [process.env.RPC_URL || ""] },
  },
});

describe("Counter", async function () {
  const { viem } = await network.connect(process.env.NETWORK_NAME || "ZKsyncOS");

  // clients bound to our explicit chain
  const publicClient = await viem.getPublicClient({ chain: zksyncos });
  const [wallet] = await viem.getWalletClients({ chain: zksyncos });
  if (!wallet) throw new Error("No wallet client. Set PRIVATE_KEY for zksyncOS.");

  const abi = CounterArtifact.abi as Abi;
  const bytecode = CounterArtifact.bytecode as `0x${string}`;

  it("Should emit the Increment event when calling the inc() function", async function () {
    const deployHash = await wallet.deployContract({ abi, bytecode, args: [] });
    const deployRcpt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const counterAddr = deployRcpt.contractAddress!;
    const fromBlock = deployRcpt.blockNumber!;

    // call inc()
    const txHash = await wallet.writeContract({
      address: counterAddr,
      abi,
      functionName: "inc",
      args: [],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const events = await publicClient.getContractEvents({
      address: counterAddr,
      abi,
      eventName: "Increment",
      fromBlock,
      strict: true,
    });
    assert.ok(events.length >= 1, "expected at least one Increment event");
    assert.equal(events.at(-1)!.args.by, 1n);
  });

  it("The sum of the Increment events should match the current value", async function () {
    const deployHash = await wallet.deployContract({ abi, bytecode, args: [] });
    const deployRcpt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    const counterAddr = deployRcpt.contractAddress!;
    const fromBlock = deployRcpt.blockNumber!;

    for (let i = 1n; i <= 10n; i++) {
      const h = await wallet.writeContract({
        address: counterAddr,
        abi,
        functionName: "incBy",
        args: [i],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
    }

    const events = await publicClient.getContractEvents({
      address: counterAddr,
      abi,
      eventName: "Increment",
      fromBlock,
      strict: true,
    });

    let total = 0n;
    for (const e of events) total += e.args.by;

    const current = await publicClient.readContract({
      address: counterAddr,
      abi,
      functionName: "x",
    });

    assert.equal(total, current);
  });
});
