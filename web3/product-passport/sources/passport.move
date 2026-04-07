module luxpass::passport {
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::guid;
    use aptos_framework::hash;
    use aptos_framework::object;
    use aptos_framework::object::{Object, ObjectCore};
    use aptos_framework::signer;
    use aptos_framework::table::{Self, Table};
    use aptos_framework::timestamp;
    use aptos_framework::util;
    use std::string::String;

    use luxpass::issuer_registry;

    // ----------------------
    // Error codes
    // ----------------------

    const E_ALREADY_INITIALIZED: u64 = 1;
    const E_EVENTS_NOT_INITIALIZED: u64 = 2;
    const E_INDEX_NOT_INITIALIZED: u64 = 3;

    const E_NOT_ISSUER: u64 = 10;
    const E_NOT_AUTHORIZED: u64 = 11;
    const E_NOT_OWNER: u64 = 12;
    const E_NOT_TRANSFERABLE: u64 = 13;
    const E_PASSPORT_LISTED: u64 = 14;

    const E_DUPLICATE_PRODUCT_ID: u64 = 20;
    const E_PRODUCT_NOT_FOUND: u64 = 21;

    // ----------------------
    // Status values
    // ----------------------

    const STATUS_ACTIVE: u8 = 1;
    const STATUS_SUSPENDED: u8 = 2;
    const STATUS_REVOKED: u8 = 3;
    const STATUS_STORING: u8 = 4;    // Initial state after seller initiates a listing
    const STATUS_VERIFYING: u8 = 5;  // Admin has received the physical product
    const STATUS_LISTING: u8 = 6;    // Product verified/minted; live for sale
    const STATUS_RETURNING: u8 = 7;       // Product is being returned to Owner

    // ----------------------
    // Passport data (stored under the passport Object address)
    // ----------------------

    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct Passport has key {
        issuer: address,
        serial_hash: vector<u8>,
        metadata_uri: String,
        metadata_hash: vector<u8>,
        status: u8,
        transferable: bool,
        created_at_secs: u64,
    }

    // Present only for transferable passports.
    // We disable ungated transfers and require this TransferRef pathway.
    #[resource_group_member(group = aptos_framework::object::ObjectGroup)]
    struct PassportControl has key {
        transfer_ref: object::TransferRef,
    }

    // ----------------------
    // On-chain Index (product id -> passport object address)
    // ----------------------

    // Stored under the registry/admin address.
    // Maps `serial_key` (address derived from sha3_256(serial_plain)) -> passport object address.
    struct PassportIndex has key {
        serial_to_passport: Table<address, address>,
    }

    /// Initialize the PassportIndex under the admin/registry address.
    /// Call once (same admin that runs init_events).
    public entry fun init_index(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<PassportIndex>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(
            admin,
            PassportIndex {
                serial_to_passport: table::new<address, address>(),
            },
        );
    }

    // ----------------------
    // Events (payload structs)
    // ----------------------

    struct PassportMinted has drop, store { passport: address, issuer: address, owner: address }
    struct PassportTransferred has drop, store { passport: address, from: address, to: address }
    struct PassportStatusChanged has drop, store { passport: address, old_status: u8, new_status: u8 }
    struct PassportListed has drop, store { passport: address, owner: address }
    struct PassportUpdated has drop, store { passport: address, updater: address, new_metadata_uri: String, new_metadata_hash: vector<u8> }
    struct PassportDelisted has drop, store {passport: address, owner: address}
    struct PassportMintListed has drop, store { passport: address, issuer: address, owner: address, old_address: String }

    // Event handles stored under the registry/admin address
    struct PassportEvents has key {
        minted: event::EventHandle<PassportMinted>,
        transferred: event::EventHandle<PassportTransferred>,
        status_changed: event::EventHandle<PassportStatusChanged>,
        listed: event::EventHandle<PassportListed>,
        updated: event::EventHandle<PassportUpdated>,
        delisted: event::EventHandle<PassportDelisted>,
        mint_list: event::EventHandle<PassportMintListed>,
    }

    // Initialize event streams under the admin/registry address.
    public entry fun init_events(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<PassportEvents>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(
            admin,
            PassportEvents {
                minted: account::new_event_handle<PassportMinted>(admin),
                transferred: account::new_event_handle<PassportTransferred>(admin),
                status_changed: account::new_event_handle<PassportStatusChanged>(admin),
                listed: account::new_event_handle<PassportListed>(admin),
                updated: account::new_event_handle<PassportUpdated>(admin),
                delisted: account::new_event_handle<PassportDelisted>(admin),
                mint_list: account::new_event_handle<PassportMintListed>(admin),
            },
        );
    }

    // ----------------------
    // Helper: derive serial_key (address) from serial_plain bytes
    // ----------------------

    fun serial_key_from_plain(serial_plain: vector<u8>): (vector<u8>, address) {
        let serial_hash = hash::sha3_256(serial_plain);
        // sha3_256 returns 32 bytes; convert directly into an address key.
        let serial_key = util::address_from_bytes(copy serial_hash);
        (serial_hash, serial_key)
    }

    fun is_marketplace_status(status: u8): bool{
        (status == STATUS_STORING || status == STATUS_VERIFYING || status == STATUS_LISTING || status == STATUS_RETURNING)
    }

    // ----------------------
    // Entry functions
    // ----------------------

    // Mint a new passport Object owned by `owner`.
    // Also writes mapping: serial_key -> passport_object_addr into PassportIndex.
    public entry fun mint(
        issuer: &signer,
        registry_addr: address,
        owner: address,
        serial_plain: vector<u8>,
        metadata_uri: String,
        metadata_bytes: vector<u8>,
        transferable: bool,
    ) acquires PassportEvents, PassportIndex {
        let issuer_addr = signer::address_of(issuer);
        assert!(issuer_registry::is_issuer(registry_addr, issuer_addr), E_NOT_ISSUER);

        assert!(exists<PassportIndex>(registry_addr), E_INDEX_NOT_INITIALIZED);
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);

        let (serial_hash, serial_key) = serial_key_from_plain(serial_plain);
        let metadata_hash = hash::sha3_256(metadata_bytes);

        // Enforce uniqueness: one passport per product id
        let idx = borrow_global_mut<PassportIndex>(registry_addr);
        assert!(!table::contains(&idx.serial_to_passport, serial_key), E_DUPLICATE_PRODUCT_ID);

        // Create object owned by `owner`
        let constructor_ref = object::create_object(owner);

        // Enforce transfer rules
        if (transferable) {
            let transfer_ref = object::generate_transfer_ref(&constructor_ref);
            object::disable_ungated_transfer(&transfer_ref);

            let obj_signer = object::generate_signer(&constructor_ref);
            move_to(&obj_signer, PassportControl { transfer_ref });
        } else {
            object::set_untransferable(&constructor_ref);
        };

        // Store Passport data under the object
        let obj_signer2 = object::generate_signer(&constructor_ref);
        move_to(
            &obj_signer2,
            Passport {
                issuer: issuer_addr,
                serial_hash,
                metadata_uri,
                metadata_hash,
                status: STATUS_ACTIVE,
                transferable,
                created_at_secs: timestamp::now_seconds(),
            },
        );

        // Get passport object address
        let obj: Object<ObjectCore> = object::object_from_constructor_ref<ObjectCore>(&constructor_ref);
        let passport_addr = object::object_address(&obj);

        // Write mapping serial_key -> passport_addr
        table::add(&mut idx.serial_to_passport, serial_key, passport_addr);

        // Emit mint list event
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.minted, PassportMinted { passport: passport_addr, issuer: issuer_addr, owner });
    }

    // Mint a new passport Object owned by `owner`. status set to listing For Admin to list verified product for owner
    // Also writes mapping: serial_key -> passport_object_addr into PassportIndex.
    public entry fun mint_listing(
        admin: &signer,
        registry_addr: address,
        owner: address,
        serial_plain: vector<u8>,
        metadata_uri: String,
        metadata_bytes: vector<u8>,
        placeholder_address: String
    ) acquires PassportEvents, PassportIndex {
        let admin_addr = signer::address_of(admin);
        let is_admin = admin_addr == issuer_registry::admin_of(registry_addr);
        assert!(is_admin, E_NOT_AUTHORIZED);

        assert!(exists<PassportIndex>(registry_addr), E_INDEX_NOT_INITIALIZED);
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);

        let (serial_hash, serial_key) = serial_key_from_plain(serial_plain);
        let metadata_hash = hash::sha3_256(metadata_bytes);

        // Enforce uniqueness: one passport per product id
        let idx = borrow_global_mut<PassportIndex>(registry_addr);
        assert!(!table::contains(&idx.serial_to_passport, serial_key), E_DUPLICATE_PRODUCT_ID);

        // Create object owned by `owner`
        let constructor_ref = object::create_object(owner);

        // Enforce transfer rules
        let transfer_ref = object::generate_transfer_ref(&constructor_ref);
        object::disable_ungated_transfer(&transfer_ref);

        let obj_signer = object::generate_signer(&constructor_ref);
        move_to(&obj_signer, PassportControl { transfer_ref });

        // Store Passport data under the object
        let obj_signer2 = object::generate_signer(&constructor_ref);
        move_to(
            &obj_signer2,
            Passport {
                issuer: admin_addr,
                serial_hash,
                metadata_uri,
                metadata_hash,
                status: STATUS_LISTING,
                transferable: true,
                created_at_secs: timestamp::now_seconds(),
            },
        );

        // Get passport object address
        let obj: Object<ObjectCore> = object::object_from_constructor_ref<ObjectCore>(&constructor_ref);
        let passport_addr = object::object_address(&obj);

        // Write mapping serial_key -> passport_addr
        table::add(&mut idx.serial_to_passport, serial_key, passport_addr);

        // Emit mint event
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.mint_list, PassportMintListed { passport: passport_addr, issuer: admin_addr, owner, old_address: placeholder_address });
    }

    // Transfer a passport (only if transferable).
    public entry fun transfer(
        owner: &signer,
        passport: Object<Passport>,
        to: address,
        registry_addr: address,
    ) acquires Passport, PassportControl, PassportEvents {
        let owner_addr = signer::address_of(owner);
        assert!(object::is_owner(passport, owner_addr), E_NOT_OWNER);

        let passport_addr = object::object_address(&passport);
        let p = borrow_global<Passport>(passport_addr);
        assert!(p.transferable, E_NOT_TRANSFERABLE); // Check if passport is transferable at all
        assert!(p.status == STATUS_ACTIVE || p.status == STATUS_LISTING, E_NOT_TRANSFERABLE);// Check if passport is active or listing and available to transfer

        let tr = &borrow_global<PassportControl>(passport_addr).transfer_ref;
        let ltr = object::generate_linear_transfer_ref(tr);
        object::transfer_with_ref(ltr, to);

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.transferred, PassportTransferred { passport: passport_addr, from: owner_addr, to });
    }

    // Lists own passport on marketplace so that passport cannot be transferred until Admin approves (owner)
    public entry fun list_passport(
        owner: &signer,
        passport: Object<Passport>,
        registry_addr: address,
    ) acquires Passport,PassportEvents{
        let owner_addr = signer::address_of(owner);
        assert!(object::is_owner(passport, owner_addr), E_NOT_OWNER);

        let passport_addr = object::object_address(&passport);
        let p = borrow_global_mut<Passport>(passport_addr);
        assert!(p.transferable && p.status == STATUS_ACTIVE, E_NOT_TRANSFERABLE);

        p.status = STATUS_STORING;

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.listed, PassportListed { passport: passport_addr, owner: owner_addr });
    }

    // Allow owner to verify that passport has been returned, admin must set state to STATUS_RETURNING first (owner)
    public entry fun delist_passport(
        owner: &signer,
        passport: Object<Passport>,
        registry_addr: address,
    ) acquires Passport,PassportEvents{
        let owner_addr = signer::address_of(owner);
        assert!(object::is_owner(passport, owner_addr), E_NOT_OWNER);

        let passport_addr = object::object_address(&passport);
        let p = borrow_global_mut<Passport>(passport_addr);
        assert!(p.transferable && p.status == STATUS_RETURNING, E_NOT_TRANSFERABLE);

        p.status = STATUS_ACTIVE;

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.listed, PassportListed { passport: passport_addr, owner: owner_addr });
    }

    // Update metadata (admin or issuer) //Should probably change issuer to verfier eventually
    public entry fun update_metadata(
        updater: &signer,
        passport_addr: address,
        registry_addr: address,
        new_metadata_uri: String,
        new_metadata_bytes: vector<u8>,
    ) acquires Passport, PassportEvents {
        let updater_addr = signer::address_of(updater);
        let p = borrow_global_mut<Passport>(passport_addr);

        let is_admin = updater_addr == issuer_registry::admin_of(registry_addr);
        let is_issuer = updater_addr == p.issuer;
        assert!(is_admin || is_issuer, E_NOT_AUTHORIZED);

        p.metadata_uri = new_metadata_uri;
        p.metadata_hash = hash::sha3_256(new_metadata_bytes);

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.updated, PassportUpdated { passport: passport_addr, updater: updater_addr, new_metadata_uri: p.metadata_uri, new_metadata_hash: p.metadata_hash });
    }

    // Update status (issuer or registry admin).
    public entry fun set_status(
        caller: &signer,
        passport_addr: address,
        registry_addr: address,
        new_status: u8,
    ) acquires Passport, PassportEvents {
        let caller_addr = signer::address_of(caller);

        let p = borrow_global_mut<Passport>(passport_addr);
        let is_admin = caller_addr == issuer_registry::admin_of(registry_addr);
        let is_issuer = caller_addr == p.issuer;
        assert!(is_admin || is_issuer, E_NOT_AUTHORIZED);
        assert!(!is_marketplace_status(p.status) || is_admin, E_PASSPORT_LISTED); // Admin can change status of marketplace statuses, Issuer cannot
        assert!(is_admin || !is_marketplace_status(new_status), E_NOT_AUTHORIZED); // Issuer cannot set marketplace status

        let old = p.status;
        p.status = new_status;

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.status_changed, PassportStatusChanged { passport: passport_addr, old_status: old, new_status });
    }

    // ----------------------
    // View functions
    // ----------------------

    #[view]
    public fun get_passport(passport_addr: address): (address, vector<u8>, String, vector<u8>, u8, bool, u64) acquires Passport {
        let p = borrow_global<Passport>(passport_addr);
        (p.issuer, p.serial_hash, p.metadata_uri, p.metadata_hash, p.status, p.transferable, p.created_at_secs)
    }

    // Backend can derive the same serial key as:
    // - serial_key = util::address_from_bytes(sha3_256(product_id_bytes))
    #[view]
    public fun passport_address_for_serial(registry_addr: address, serial_key: address): address acquires PassportIndex {
        assert!(exists<PassportIndex>(registry_addr), E_INDEX_NOT_INITIALIZED);
        let idx = borrow_global<PassportIndex>(registry_addr);
        assert!(table::contains(&idx.serial_to_passport, serial_key), E_PRODUCT_NOT_FOUND);
        *table::borrow(&idx.serial_to_passport, serial_key)
    }

    // Convenience: accept raw product id bytes (serial/tag uid),
    // derive serial_key internally, and return the passport address.
    #[view]
    public fun passport_address_for_product_id(registry_addr: address, serial_plain: vector<u8>): address acquires PassportIndex {
        let (_hash, serial_key) = serial_key_from_plain(serial_plain);
        passport_address_for_serial(registry_addr, serial_key)
    }

    #[view]
    public fun status_labels(): (u8, u8, u8, u8, u8, u8, u8) {
        (STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_REVOKED, STATUS_STORING, STATUS_VERIFYING, STATUS_LISTING, STATUS_RETURNING)
    }

    // Expose event stream metadata for off-chain indexing
    public fun minted_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).minted;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun transferred_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).transferred;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun status_changed_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).status_changed;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun status_listed_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).listed;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun status_updated_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).updated;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun status_deListed_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).delisted;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun passport_mintList_handle(registry_addr: address): (guid::ID, u64) acquires PassportEvents {
        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let h = &borrow_global<PassportEvents>(registry_addr).mint_list;
        (guid::id(event::guid(h)), event::counter(h))
    }
}
