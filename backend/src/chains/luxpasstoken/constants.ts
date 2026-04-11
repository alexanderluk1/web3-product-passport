export const LPT_MODULE_ADDRESS = process.env.LPT_MODULE_ADDRESS!;
export const LPT_MODULE_NAME = "lux_pass_token";
export const LPT_STATE_ADDRESS = process.env.LPT_STATE_ADDRESS!;

export function lptFunction(functionName: string): `${string}::${string}::${string}` {
  return `${LPT_MODULE_ADDRESS}::${LPT_MODULE_NAME}::${functionName}`;
}
