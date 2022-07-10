import { Block } from "@ethereumjs/block";
import Common, { Chain, Hardfork } from "@ethereumjs/common";
import { Transaction } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util";
import VM from "@ethereumjs/vm";
import { defaultAbiCoder as AbiCoder, Interface } from "@ethersproject/abi";
import { getAccountNonce, insertAccount } from "./helpers/account-utils";
import {
  buildTransaction,
  encodeDeployment,
  encodeFunction,
} from "./helpers/tx-builder";

const INITIAL_GREETING = "Hello, World!";
const SECOND_GREETING = "Hola, Mundo!";

const common = new Common({
  chain: Chain.Rinkeby,
  hardfork: Hardfork.Istanbul,
});
const block = Block.fromBlockData(
  { header: { extraData: Buffer.alloc(97) } },
  { common }
);

async function deployContract(
  vm: VM,
  senderPrivateKey: Buffer,
  deploymentBytecode: Buffer,
  greeting: string
): Promise<Address> {
  // Contracts are deployed by sending their deployment bytecode to the address 0
  // The contract params should be abi-encoded and appended to the deployment bytecode.
  const data = encodeDeployment(deploymentBytecode.toString("hex"), {
    types: ["string"],
    values: [greeting],
  });
  const txData = {
    data,
    nonce: await getAccountNonce(vm, senderPrivateKey),
  };

  const tx = Transaction.fromTxData(buildTransaction(txData), { common }).sign(
    senderPrivateKey
  );

  const deploymentResult = await vm.runTx({ tx, block });

  if (deploymentResult.execResult.exceptionError) {
    throw deploymentResult.execResult.exceptionError;
  }

  return deploymentResult.createdAddress!;
}

async function setGreeting(
  vm: VM,
  senderPrivateKey: Buffer,
  contractAddress: Address,
  greeting: string
) {
  const data = encodeFunction("setGreeting", {
    types: ["string"],
    values: [greeting],
  });

  const txData = {
    to: contractAddress,
    data,
    nonce: await getAccountNonce(vm, senderPrivateKey),
  };

  const tx = Transaction.fromTxData(buildTransaction(txData), { common }).sign(
    senderPrivateKey
  );

  const setGreetingResult = await vm.runTx({ tx, block });

  if (setGreetingResult.execResult.exceptionError) {
    throw setGreetingResult.execResult.exceptionError;
  }
}

async function getGreeting(vm: VM, contractAddress: Address, caller: Address) {
  const sigHash = new Interface(["function greet()"]).getSighash("greet");

  const greetResult = await vm.evm.runCall({
    to: contractAddress,
    caller: caller,
    origin: caller, // The tx.origin is also the caller here
    data: Buffer.from(sigHash.slice(2), "hex"),
    block,
  });

  if (greetResult.execResult.exceptionError) {
    throw greetResult.execResult.exceptionError;
  }

  const results = AbiCoder.decode(
    ["string"],
    greetResult.execResult.returnValue
  );

  return results[0];
}

export async function run({ bytecode }: { bytecode: { object: Buffer } }) {
  const accountPk = Buffer.from(
    "e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109",
    "hex"
  );

  const vm = await VM.create({ common });
  const accountAddress = Address.fromPrivateKey(accountPk);

  console.log("Account: ", accountAddress.toString());
  await insertAccount(vm, accountAddress);

  console.log("Deploying the contract...");

  const contractAddress = await deployContract(
    vm,
    accountPk,
    bytecode.object,
    INITIAL_GREETING
  );

  console.log("Contract address:", contractAddress.toString());

  const greeting = await getGreeting(vm, contractAddress, accountAddress);

  console.log("Greeting:", greeting);

  if (greeting !== INITIAL_GREETING)
    throw new Error(
      `initial greeting not equal, received ${greeting}, expected ${INITIAL_GREETING}`
    );

  console.log("Changing greeting...");

  await setGreeting(vm, accountPk, contractAddress, SECOND_GREETING);

  const greeting2 = await getGreeting(vm, contractAddress, accountAddress);

  console.log("Greeting:", greeting2);

  if (greeting2 !== SECOND_GREETING)
    throw new Error(
      `second greeting not equal, received ${greeting2}, expected ${SECOND_GREETING}`
    );

  // Now let's look at what we created. The transaction
  // should have created a new account for the contract
  // in the state. Let's test to see if it did.

  const createdAccount = await vm.stateManager.getAccount(contractAddress);

  console.log("-------results-------");
  console.log("nonce: " + createdAccount.nonce.toString());
  console.log("balance in wei: ", createdAccount.balance.toString());
  console.log("stateRoot: 0x" + createdAccount.stateRoot.toString("hex"));
  console.log("codeHash: 0x" + createdAccount.codeHash.toString("hex"));
  console.log("---------------------");

  console.log("Everything ran correctly!");
}
