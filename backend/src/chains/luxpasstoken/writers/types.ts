export type SubmitResult =
  | {
      success: true;
      transactionHash: string;
      vmStatus?: string;
    }
  | {
      success: false;
      transactionHash?: string;
      vmStatus?: string;
      error: string;
    };
