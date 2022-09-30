import { toChecksumAddress } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak";

export type StorageItem = {
  astId: number; // 2;
  contract: string; // "Contract.sol:Greeter";
  label: string; // "greeting";
  offset: number; // 0;
  slot: string; // "0";
  type: string; // "t_string_storage";
};

export type PrimitiveTypeItem = {
  encoding: string; // "bytes";
  label: string; // "string";
  numberOfBytes: string; // "32";
};

export type StructTypeItem = PrimitiveTypeItem & {
  members: StorageItem[];
};

export type MappingTypeItem = PrimitiveTypeItem & {
  encoding: "mapping";
  key: string; // 't_address'
  value: string; // 't_bool'
};

export type DynamicArrayTypeItem = PrimitiveTypeItem & {
  encoding: "dynamic_array";
  base: string; // 't_struct(S)8_storage'
};

export type TypeItem =
  | PrimitiveTypeItem
  | StructTypeItem
  | MappingTypeItem
  | DynamicArrayTypeItem;

export type StorageLayout = {
  storage: StorageItem[];
  types: Record<string, TypeItem>;
};

function toBuffer(hexString: string) {
  return Buffer.from(hexString.slice(2), "hex");
}

function toBigInt(buffer: Buffer | Uint8Array) {
  if (buffer instanceof Uint8Array) {
    buffer = Buffer.from(buffer);
  }
  return BigInt("0x" + (buffer.toString("hex") || "0"));
}

function fromBigInt(bigInt: BigInt | Uint16Array) {
  return Buffer.from(bigInt.toString(16).padStart(64, "0"), "hex");
}

type GetStorageAt = (key: Buffer | string) => Promise<Buffer>;

async function decodeBytes(getStorageAt: GetStorageAt, paddedSlot: Buffer) {
  const value = await getStorageAt(paddedSlot);

  if (value.length === 32 && value.readInt8(31) !== 0) {
    const dataLength = value.readInt8(31);
    const data = value.subarray(0, dataLength / 2);
    return data;
  } else {
    const dataLength = toBigInt(value) / 2n;

    let offset = 0n;
    let currentSlot = Buffer.from(keccak256(paddedSlot));
    let chunks: Buffer[] = [];

    // Iterate over 32-byte slots
    while (offset < dataLength) {
      chunks.push(await getStorageAt(currentSlot));
      currentSlot = fromBigInt(toBigInt(currentSlot) + 1n);
      offset += 32n;
    }

    return Buffer.concat(chunks).subarray(0, Number(dataLength));
  }
}

async function decodeItem(
  getStorage: GetStorageAt,
  storageLayout: StorageLayout,
  item: StorageItem,
  type: TypeItem
): Promise<any> {
  function getPaddedSlot(slot: string) {
    const slotNumber = BigInt(slot);
    return fromBigInt(slotNumber);
  }

  const paddedSlot = getPaddedSlot(item.slot);
  const value = await getStorage(paddedSlot);

  // console.log(paddedSlot.toString("hex"));

  switch (type.label) {
    case "address": {
      const dataLength = Number(type.numberOfBytes);
      const data = value.subarray(0, dataLength);
      return toChecksumAddress(
        "0x" + data.toString("hex").padStart(dataLength * 2, "0")
      );
    }
    case "bool": {
      return toBigInt(value) != 0n;
    }
    case "uint256": {
      return toBigInt(value);
    }
    case "string": {
      const bytes = await decodeBytes(getStorage, paddedSlot);
      return bytes.toString("utf8");
    }
    case "bytes": {
      const bytes = await decodeBytes(getStorage, paddedSlot);
      return Uint8Array.from(bytes);
    }
    default: {
      // Mapping
      if ("key" in type) {
        return {};
      }

      if ("base" in type) {
        const baseType = storageLayout.types[type.base];
        const itemCount = toBigInt(value);
        const stride = BigInt(baseType.numberOfBytes) / 32n;

        let index = 0n;
        let currentSlot = Buffer.from(keccak256(paddedSlot));
        let values: Buffer[] = [];

        // Iterate over slots
        while (index < itemCount) {
          const innerItem: StorageItem = {
            ...item,
            // Slot gets passed to the BigInt constructor
            slot: "0x" + (currentSlot.toString("hex") || "0"),
            type: baseType.label,
          };

          const val = await decodeItem(
            getStorage,
            storageLayout,
            innerItem,
            baseType
          );

          values.push(val);
          currentSlot = Buffer.from(fromBigInt(toBigInt(currentSlot) + stride));
          index += 1n;
        }

        return values;
      }

      // Struct
      if ("members" in type) {
        const values = type.members.map(async (member) => {
          const type = storageLayout.types[member.type];
          // Offset the slot based on the struct slot
          const memberWithOffset = {
            ...member,
            slot: (BigInt(item.slot) + BigInt(member.slot)).toString(),
          };
          const val = await decodeItem(
            getStorage,
            storageLayout,
            memberWithOffset,
            type
          );
          return [member.label, val];
        });

        const variables = await Promise.all(values);

        return Object.fromEntries(variables);
      }

      throw new Error(`Storage type ${type.label} not handled yet`);
    }
  }
}

// Source layout info: https://docs.soliditylang.org/en/v0.8.15/internals/layout_in_storage.html
// Source location mapping: https://docs.soliditylang.org/en/v0.8.16/internals/source_mappings.html
// https://betterprogramming.pub/solidity-storage-variables-with-ethers-js-ca3c7e2c2a64
export async function getContractVariable({
  getStorageAt,
  storageLayout,
  variable,
}: {
  getStorageAt: GetStorageAt;
  storageLayout: StorageLayout;
  variable: string;
}) {
  const item = storageLayout.storage.find((item) => item.label === variable);

  if (!item) {
    throw new Error(`No variable '${variable}'`);
  }

  const type = storageLayout.types[item.type];

  try {
    return {
      type: type.label,
      value: await decodeItem(getStorageAt, storageLayout, item, type),
    };
  } catch (e) {
    console.log(item, type);
    throw e;
  }
}

export async function getContractVariables({
  getStorageAt,
  storageLayout,
}: {
  getStorageAt: GetStorageAt;
  storageLayout: StorageLayout;
}) {
  const values = storageLayout.storage.map(async (item) => {
    const value = await getContractVariable({
      getStorageAt,
      storageLayout,
      variable: item.label,
    });

    return [item.label, value];
  });

  const variables = await Promise.all(values);

  return Object.fromEntries(variables);
}
