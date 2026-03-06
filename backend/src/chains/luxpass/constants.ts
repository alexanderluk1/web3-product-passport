export const MODULE_ADDRESS = process.env.MODULE_ADDRESS!; // published address
export const PASSPORT_GET_FN = `${MODULE_ADDRESS}::passport::get_passport`;
export const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!; // address of admin registry
export const LOOKUP_BY_PRODUCT_FN = `${MODULE_ADDRESS}::passport::passport_address_for_product_id`;
const MODULE_NAME = "issuer_registry"
export const GET_REGISTRY_FN = `${MODULE_ADDRESS}::${MODULE_NAME}::get_registry`;