globalThis.self = globalThis;

const solc = require("solc");
const { run } = require("./dist/bundle");

async function main() {
  const compiler = {
    compile(input) {
      return JSON.parse(solc.compile(JSON.stringify(input)));
    },
  };

  await run({ compiler });
}

main();
