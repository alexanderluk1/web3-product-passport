const FULLNODE_URL =
  process.env.APTOS_FULLNODE_URL || "https://fullnode.devnet.aptoslabs.com/v1";

type ObjectCoreResource = {
  type: string;
  data: {
    owner: string;
  };
};

export async function getPassportOwner(
  passportObjectAddress: string
): Promise<string> {
  const response = await fetch(
    `${FULLNODE_URL}/accounts/${passportObjectAddress}/resource/0x1::object::ObjectCore`
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ObjectCore for ${passportObjectAddress}: ${response.status}`
    );
  }

  const resource = (await response.json()) as ObjectCoreResource;
  return resource.data.owner;
}
