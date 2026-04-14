export const MODULE_ADDRESS = process.env.MODULE_ADDRESS!; // published address
export const PASSPORT_GET_FN = `${MODULE_ADDRESS}::passport::get_passport`;
export const PASSPORT_TRANSFER_FN = `${MODULE_ADDRESS}::passport::transfer`;
export const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS!; // address of admin registry
export const LOOKUP_BY_PRODUCT_FN = `${MODULE_ADDRESS}::passport::passport_address_for_product_id`;
const MODULE_NAME = "issuer_registry"
export const GET_REGISTRY_FN = `${MODULE_ADDRESS}::${MODULE_NAME}::get_registry`;

// Admin functions to set_status and update_metadata
export const PASSPORT_SET_STATUS_FN      = `${MODULE_ADDRESS}::passport::set_status`;
export const PASSPORT_UPDATE_METADATA_FN = `${MODULE_ADDRESS}::passport::update_metadata`;
export const PASSPORT_LIST_FN = `${MODULE_ADDRESS}::passport::list_passport`;
export const PASSPORT_DELIST_FN = `${MODULE_ADDRESS}::passport::delist_passport`;
export const PASSPORT_MINTLIST_FN = `${MODULE_ADDRESS}::passport::mint_listing`;

// mintList event
export const PASSPORT_MINTLIST_EV = `${MODULE_ADDRESS}::passport::PassportMintListed`;
//status values
export const STATUS_ACTIVE    = 1;
export const STATUS_SUSPENDED = 2;
export const STATUS_REVOKED   = 3;
export const STATUS_STORING = 4;
export const STATUS_VERIFYING = 5;
export const STATUS_LISTING = 6;
export const STATUS_RETURNING = 7;

// Escrow module
export const ESCROW_CREATE_LISTING_FN   = `${MODULE_ADDRESS}::escrow::create_listing`;
export const ESCROW_PURCHASE_FN         = `${MODULE_ADDRESS}::escrow::purchase`;
export const ESCROW_CANCEL_LISTING_FN   = `${MODULE_ADDRESS}::escrow::cancel_listing`;
export const ESCROW_UPDATE_PRICE_FN     = `${MODULE_ADDRESS}::escrow::update_price`;
export const ESCROW_ADMIN_CANCEL_FN     = `${MODULE_ADDRESS}::escrow::admin_cancel_listing`;
export const ESCROW_INIT_FN             = `${MODULE_ADDRESS}::escrow::init_escrow`;
export const ESCROW_GET_LISTING_FN      = `${MODULE_ADDRESS}::escrow::get_listing`;
export const ESCROW_GET_ADDRESS_FN      = `${MODULE_ADDRESS}::escrow::get_escrow_address`;

// Escrow events
export const ESCROW_PURCHASE_COMPLETED_EV = `${MODULE_ADDRESS}::escrow::PurchaseCompleted`;