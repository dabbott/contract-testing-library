import { Block } from "@ethereumjs/block";
import { Chain, Common, Hardfork } from "@ethereumjs/common";
import { Transaction } from "@ethereumjs/tx";
import { Address } from "@ethereumjs/util";
import { VM } from "@ethereumjs/vm";
import { Result } from "@ethersproject/abi";
import { BytesLike } from "@ethersproject/bytes";
import {
  Contract,
  ContractFactory,
  ContractInterface,
} from "@ethersproject/contracts";
import { getAccountNonce, insertAccount } from "./helpers/account-utils";
import {
  getContractVariable,
  getContractVariables,
  StorageLayout,
} from "./helpers/storage-utils";
import { buildTransaction } from "./helpers/tx-builder";

const common = new Common({
  chain: Chain.Rinkeby,
  hardfork: Hardfork.Istanbul,
});

const block = Block.fromBlockData(
  { header: { extraData: Buffer.alloc(97) } },
  { common }
);

export async function deployContract(
  vm: VM,
  senderPrivateKey: Buffer,
  deploymentData: Buffer
): Promise<Address> {
  const txData = {
    data: deploymentData,
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

export async function callFunction(
  vm: VM,
  senderPrivateKey: Buffer,
  contractAddress: Address,
  data: string
) {
  const txData = {
    to: contractAddress,
    data,
    nonce: await getAccountNonce(vm, senderPrivateKey),
  };

  const tx = Transaction.fromTxData(buildTransaction(txData), { common }).sign(
    senderPrivateKey
  );

  const result = await vm.runTx({ tx, block });

  if (result.execResult.exceptionError) {
    throw result.execResult.exceptionError;
  }

  return result.execResult.returnValue;
}

export function getDefaultPrivateKey() {
  return Buffer.from(
    "e331b6d69882b4cb4ea581d88e0b604039a3de5967688d3dcffdd2270c0fd109",
    "hex"
  );
}

export function createAccount(accountPrivateKey: Buffer) {
  return Address.fromPrivateKey(accountPrivateKey);
}

export async function initialize({
  accountAddress,
}: {
  accountAddress: Address;
}) {
  const vm = await VM.create({ common });

  await insertAccount(vm, accountAddress);

  return vm;
}

export async function deploy({
  abi,
  bytecode,
  storageLayout,
  args = [],
}: {
  abi: ContractInterface;
  bytecode: BytesLike | { object: string };
  storageLayout?: StorageLayout;
  args?: any[];
}) {
  const contractFactory = new ContractFactory(abi, bytecode);
  const deployTx = contractFactory.getDeployTransaction(...args);
  const deploymentData = deployTx.data as Buffer;

  const accountPrivateKey = getDefaultPrivateKey();
  const accountAddress = createAccount(accountPrivateKey);
  const vm = await initialize({ accountAddress });

  const contractAddress = await deployContract(
    vm,
    accountPrivateKey,
    deploymentData
  );

  const contract = contractFactory.attach(contractAddress.toString());

  const getStorageAt = (key: string | Buffer) => {
    if (typeof key === "string") {
      if (key.startsWith("0x")) {
        key = key.slice(2);
      }
      key = Buffer.from(key, "hex");
    }

    return vm.stateManager.getContractStorage(contractAddress, key);
  };

  return {
    address: contractAddress,
    call(name: string, ...args: any[]): Promise<Result> {
      return call({
        contract,
        name,
        vm,
        accountPrivateKey,
        args,
      });
    },
    getVariable(variable: string) {
      if (!storageLayout) {
        throw new Error(
          `Pass 'storageLayout' when deploying to access variable values.`
        );
      }

      return getContractVariable({
        getStorageAt,
        storageLayout,
        variable,
      });
    },
    getVariables() {
      if (!storageLayout) {
        throw new Error(
          `Pass 'storageLayout' when deploying to access variable values.`
        );
      }

      return getContractVariables({
        getStorageAt,
        storageLayout,
      });
    },
    dumpStorage() {
      return vm.stateManager.dumpStorage(contractAddress);
    },
  };
}

export async function call({
  contract,
  name,
  vm,
  accountPrivateKey,
  args = [],
}: {
  contract: Contract;
  name: string;
  vm: VM;
  accountPrivateKey: Buffer;
  args?: any[];
}) {
  const greetFunction = await contract.interface.getFunction(name);
  const populated = await contract.populateTransaction[name](...args);

  const result = await callFunction(
    vm,
    accountPrivateKey,
    Address.fromString(contract.address),
    populated.data!
  );

  return contract.interface.decodeFunctionResult(greetFunction, result);
}
