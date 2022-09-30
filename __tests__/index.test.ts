// @ts-expect-error
globalThis.self = globalThis;

import { expect, it } from "vitest";

import { deploy } from "../index";

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

const STORAGE_SOL = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract A {
  struct S {
    uint256 a;
    uint256 c;
    string nestedString;
    // uint[2] staticArray;
    // uint[] dynArray;
  }

  uint x = 1;
  uint y = 2;
  bool b = true;
  S s;
  address addr = 0x5BF4be9de72713bFE39A30EbE0691afd5fb7413a;
  mapping (address => bool) map1;
  // mapping (uint => mapping (address => bool)) map;
  string s1;
  bytes b1;
  S[] sArray;
  uint256[] array;
  
  constructor() {
    s = S(7, 3, "hello");
    array.push(1);
    array.push(2);
    array.push(3);
    sArray.push(S(5, 4, "yo"));
    sArray.push(S(8, 9, "oy"));
  }

  function setS1(string memory _s1) public {
    s1 = _s1;
  }

  function setB1(bytes memory _b1) public {
    b1 = _b1;
  }
}
`;

function getSolcInput(files: Record<string, string>) {
  return {
    language: "Solidity",
    sources: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, { content }])
    ),
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "petersburg",
      outputSelection: {
        "*": {
          "*": ["*"],
        },
      },
    },
  };
}

function compile(input: any) {
  return JSON.parse(solc.compile(JSON.stringify(input)));
}

it("deploys", async () => {
  const output = compile(getSolcInput({ "Greeter.sol": GREETER_SOL }));

  const {
    abi,
    evm: { bytecode },
  } = output.contracts["Greeter.sol"].Greeter;

  const contract = await deploy({ abi, bytecode, args: ["Hello, World!"] });

  expect(await contract.call("greet")).toEqual(["Hello, World!"]);

  await contract.call("setGreeting", "Hola");

  expect(await contract.call("greet")).toEqual(["Hola"]);
});

it("reads contract variable", async () => {
  const output = compile(getSolcInput({ "Greeter.sol": GREETER_SOL }));

  const {
    abi,
    evm: { bytecode },
    storageLayout,
  } = output.contracts["Greeter.sol"].Greeter;

  const contract = await deploy({
    abi,
    bytecode,
    storageLayout,
    args: ["Hello, World!"],
  });

  expect(await contract.getVariables()).toEqual({
    greeting: {
      type: "string",
      value: "Hello, World!",
    },
  });
});

it("reads contract variable", async () => {
  const output = compile(getSolcInput({ "Storage.sol": STORAGE_SOL }));

  if (output.errors) {
    console.log(output.errors);
  }

  const {
    abi,
    evm: { bytecode },
    storageLayout,
  } = output.contracts["Storage.sol"].A;

  const contract = await deploy({
    abi,
    bytecode,
    storageLayout,
  });

  expect(await contract.getVariable("x")).toEqual({
    type: "uint256",
    value: 1n,
  });
  expect(await contract.getVariable("y")).toEqual({
    type: "uint256",
    value: 2n,
  });
  expect(await contract.getVariable("b")).toEqual({
    type: "bool",
    value: true,
  });
  expect(await contract.getVariable("addr")).toEqual({
    type: "address",
    value: "0x5BF4be9de72713bFE39A30EbE0691afd5fb7413a",
  });

  await contract.call("setS1", "Hola");
  expect(await contract.getVariable("s1")).toEqual({
    type: "string",
    value: "Hola",
  });

  const longString =
    "abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz";

  await contract.call("setS1", longString);
  expect(await contract.getVariable("s1")).toEqual({
    type: "string",
    value: longString,
  });

  await contract.call("setB1", new Uint8Array([3, 2, 1, 0]));
  expect(await contract.getVariable("b1")).toEqual({
    type: "bytes",
    value: new Uint8Array([3, 2, 1, 0]),
  });

  await contract.call("setB1", Buffer.from(longString));
  expect(await contract.getVariable("b1")).toEqual({
    type: "bytes",
    value: Uint8Array.from(Buffer.from(longString)),
  });

  expect(await contract.getVariable("map1")).toEqual({
    type: "mapping(address => bool)",
    value: {},
  });

  expect(await contract.getVariable("s")).toEqual({
    type: "struct A.S",
    value: {
      a: 7n,
      c: 3n,
      nestedString: "hello",
    },
  });

  expect(await contract.getVariable("array")).toEqual({
    type: "uint256[]",
    value: [1n, 2n, 3n],
  });

  expect(await contract.getVariable("sArray")).toEqual({
    type: "struct A.S[]",
    value: [
      {
        a: 5n,
        c: 4n,
        nestedString: "yo",
      },
      {
        a: 8n,
        c: 9n,
        nestedString: "oy",
      },
    ],
  });
});
