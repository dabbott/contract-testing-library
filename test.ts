// @ts-expect-error
globalThis.self = globalThis;

import { deploy } from "./dist";

const solc = require("solc");

const GREETER_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Greeter {
    string greeting;

    constructor(string memory _greeting) {
        greeting = _greeting;
    }

    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }
}
`;

/**
 * This function creates the input for the Solidity compiler.
 *
 * For more info about it, go to https://solidity.readthedocs.io/en/v0.5.10/using-the-compiler.html#compiler-input-and-output-json-description
 *
 * Note: this example additionally needs the Solidity compiler `solc` package (out of EthereumJS
 * scope) being installed. You can do this (in this case it might make sense to install globally)
 * with `npm i -g solc`.
 */
function getSolcInput() {
  return {
    language: "Solidity",
    sources: {
      "Greeter.sol": {
        content: GREETER_SOL,
      },
      // If more contracts were to be compiled, they should have their own entries here
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "petersburg",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };
}

export type ICompiler = {
  compile(input: any): any;
};

/**
 * This function compiles all the contracts in `contracts/` and returns the Solidity Standard JSON
 * output. If the compilation fails, it returns `undefined`.
 *
 * To learn about the output format, go to https://solidity.readthedocs.io/en/v0.5.10/using-the-compiler.html#compiler-input-and-output-json-description
 */
function compileContracts({ compiler }: { compiler: ICompiler }) {
  const input = getSolcInput();
  const output = compiler.compile(input);

  let compilationFailed = false;

  if (output.errors) {
    for (const error of output.errors) {
      if (error.severity === "error") {
        console.error(error.formattedMessage);
        compilationFailed = true;
      } else {
        console.warn(error.formattedMessage);
      }
    }
  }

  if (compilationFailed) {
    return undefined;
  }

  return output;
}

// async function main() {
//   const compiler = {
//     compile(input: any) {
//       return JSON.parse(solc.compile(JSON.stringify(input)));
//     },
//   };

//   const output = compiler.compile(getSolcInput());
//   const {
//     abi,
//     evm: { bytecode },
//   } = output.contracts["Greeter.sol"].Greeter;

//   const contract = new ContractFactory(abi, bytecode);
//   const tx = contract.getDeployTransaction("Hello, World!");

//   await run({ deploymentData: tx.data as Buffer });
// }

function compile(input: any) {
  return JSON.parse(solc.compile(JSON.stringify(input)));
}

async function main() {
  // Compile
  const output = compile(getSolcInput());
  const {
    abi,
    evm: { bytecode },
  } = output.contracts["Greeter.sol"].Greeter;

  const contract = await deploy({ abi, bytecode, args: ["Hello, World!"] });

  const result = await contract.call("greet");

  console.log(result);
}

main();
