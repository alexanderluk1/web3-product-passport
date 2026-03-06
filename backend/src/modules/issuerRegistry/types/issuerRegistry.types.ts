export type RegisterIssuerRequest = {
  issuerAddress: string;
};

export type RegisterIssuerResponse =
  | {
      success: true;
      issuerAddress: string;
      transactionHash: string;
    }
  | {
      success: false;
      error: string;
      transactionHash?: string;
      vmStatus?: string;
    };

export type IssuerListItem = {
  issuerAddress: string;
  status: "ACTIVE" | "REMOVED";
  registeredAt: number;
  removedAt?: number;
};

export type GetAllIssuersResponse = {
  issuers: IssuerListItem[];
};