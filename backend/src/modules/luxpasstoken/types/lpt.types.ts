export type PreparedTransactionPayload = {
  function: `${string}::${string}::${string}`;
  functionArguments: unknown[];
};

export type PrepareAmountBody = {
  amount: number | string;
};

export type PrepareMintBody = PrepareAmountBody & {
  recipientAddress: string;
};

export type PrepareTransferBody = PrepareAmountBody & {
  recipientAddress: string;
};

export type PrepareClaimReferralBody = {
  referrerAddress: string;
};

export type PrepareCreditFiatBody = PrepareAmountBody & {
  buyerAddress: string;
};

export type PrepareAllocateBody = PrepareAmountBody & {
  recipientAddress: string;
};

export type PreparePayFeeBody = PrepareAmountBody & {
  treasuryAddress: string;
};
