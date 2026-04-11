import { AccountAddress } from "@aptos-labs/ts-sdk";
import { LPT_MODULE_ADDRESS, LPT_MODULE_NAME } from "../../../chains/luxpasstoken/constants";
import { makeAptosClient } from "../../../config/aptos";

export type SimulateLptRequest = {
  sender: string;
  function: string;
  functionArguments: unknown[];
};

function assertLuxPassTokenEntry(functionId: string): void {
  const parts = functionId.trim().split("::");
  if (parts.length !== 3) {
    throw new Error(`function must be <addr>::${LPT_MODULE_NAME}::<entry>`);
  }
  const [addrPart, modulePart] = parts;
  if (modulePart !== LPT_MODULE_NAME) {
    throw new Error(`module name must be ${LPT_MODULE_NAME}`);
  }
  const fnModuleAddr = AccountAddress.from(addrPart).toString();
  const expectedAddr = AccountAddress.from(LPT_MODULE_ADDRESS).toString();
  if (fnModuleAddr !== expectedAddr) {
    throw new Error(
      `function address must match LPT_MODULE_ADDRESS (expected ${expectedAddr})`
    );
  }
}


// SIMULATE entry function call
export async function simulateLptEntryFunction(input: SimulateLptRequest) {
  const sender = input.sender?.trim();
  const functionId = input.function?.trim();
  if (!sender) {
    throw new Error("sender is required.");
  }
  if (!functionId) {
    throw new Error("function is required.");
  }
  if (!Array.isArray(input.functionArguments)) {
    throw new Error("functionArguments must be an array.");
  }

  assertLuxPassTokenEntry(functionId);

  const aptos = makeAptosClient();

  const transaction = await aptos.transaction.build.simple({
    sender,
    data: {
      function: functionId,
      functionArguments: input.functionArguments,
    },
  });

  const responses = await aptos.transaction.simulate.simple({
    transaction,
  });

  const first = responses[0];
  if (!first) {
    throw new Error("Simulation returned no result.");
  }

  return first;
}
