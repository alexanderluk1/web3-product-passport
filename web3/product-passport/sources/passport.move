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
    use luxpass::lux_pass_token;

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

    const E_DUPLICATE_PRODUCT_ID: u64 = 20;
    const E_PRODUCT_NOT_FOUND: u64 = 21;

    // ----------------------
    // Status values
    // ----------------------

    const STATUS_ACTIVE: u8 = 1;
    const STATUS_SUSPENDED: u8 = 2;
    const STATUS_REVOKED: u8 = 3;

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

    // Event handles stored under the registry/admin address
    struct PassportEvents has key {
        minted: event::EventHandle<PassportMinted>,
        transferred: event::EventHandle<PassportTransferred>,
        status_changed: event::EventHandle<PassportStatusChanged>,
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

    // ----------------------
    // Entry functions
    // ----------------------

    fun mint_impl(
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

        // Emit mint event
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.minted, PassportMinted { passport: passport_addr, issuer: issuer_addr, owner });
    }

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
        mint_impl(
            issuer,
            registry_addr,
            owner,
            serial_plain,
            metadata_uri,
            metadata_bytes,
            transferable,
        );
    }

    /// Same as `mint`, but burns `burn_amount` LPT from the issuer first (atomic).
    public entry fun mint_with_burn(
        issuer: &signer,
        registry_addr: address,
        owner: address,
        serial_plain: vector<u8>,
        metadata_uri: String,
        metadata_bytes: vector<u8>,
        transferable: bool,
        lpt_state_addr: address,
        burn_amount: u64,
    ) acquires PassportEvents, PassportIndex {
        lux_pass_token::passport_burn(issuer, lpt_state_addr, burn_amount);
        mint_impl(
            issuer,
            registry_addr,
            owner,
            serial_plain,
            metadata_uri,
            metadata_bytes,
            transferable,
        );
    }

    /// Same as `mint_with_burn`, but also transfers LPT gas-fee to `treasury`.
    public entry fun mint_with_burn_lpt(
        issuer: &signer,
        registry_addr: address,
        owner: address,
        serial_plain: vector<u8>,
        metadata_uri: String,
        metadata_bytes: vector<u8>,
        transferable: bool,
        lpt_state_addr: address,
        burn_amount: u64,
        treasury: address,
        gas_fee_amount: u64,
    ) acquires PassportEvents, PassportIndex {
        lux_pass_token::passport_burn(issuer, lpt_state_addr, burn_amount);
        lux_pass_token::passport_gas_fee(issuer, lpt_state_addr, treasury, gas_fee_amount);
        mint_impl(
            issuer,
            registry_addr,
            owner,
            serial_plain,
            metadata_uri,
            metadata_bytes,
            transferable,
        );
    }

    fun transfer_impl(
        owner: &signer,
        passport: Object<Passport>,
        to: address,
        registry_addr: address,
    ) acquires Passport, PassportControl, PassportEvents {
        let owner_addr = signer::address_of(owner);
        assert!(object::is_owner(passport, owner_addr), E_NOT_OWNER);

        let passport_addr = object::object_address(&passport);
        let p = borrow_global<Passport>(passport_addr);
        assert!(p.transferable, E_NOT_TRANSFERABLE);

        let tr = &borrow_global<PassportControl>(passport_addr).transfer_ref;
        let ltr = object::generate_linear_transfer_ref(tr);
        object::transfer_with_ref(ltr, to);

        assert!(exists<PassportEvents>(registry_addr), E_EVENTS_NOT_INITIALIZED);
        let ev = borrow_global_mut<PassportEvents>(registry_addr);
        event::emit_event(&mut ev.transferred, PassportTransferred { passport: passport_addr, from: owner_addr, to });
    }

    // Transfer a passport (only if transferable).
    public entry fun transfer(
        owner: &signer,
        passport: Object<Passport>,
        to: address,
        registry_addr: address,
    ) acquires Passport, PassportControl, PassportEvents {
        transfer_impl(owner, passport, to, registry_addr);
    }

    /// Same as `transfer`, but burns `burn_amount` LPT from the owner first (atomic).
    public entry fun trf_with_burn(
        owner: &signer,
        passport: Object<Passport>,
        to: address,
        registry_addr: address,
        lpt_state_addr: address,
        burn_amount: u64,
    ) acquires Passport, PassportControl, PassportEvents {
        lux_pass_token::transfer_burn(owner, lpt_state_addr, burn_amount);
        transfer_impl(owner, passport, to, registry_addr);
    }

    /// Same as `trf_with_burn`, but also transfers LPT gas-fee to `treasury`.
    public entry fun trf_with_burn_lpt(
        owner: &signer,
        passport: Object<Passport>,
        to: address,
        registry_addr: address,
        lpt_state_addr: address,
        burn_amount: u64,
        treasury: address,
        gas_fee_amount: u64,
    ) acquires Passport, PassportControl, PassportEvents {
        lux_pass_token::transfer_burn(owner, lpt_state_addr, burn_amount);
        lux_pass_token::transfer_gas_fee(owner, lpt_state_addr, treasury, gas_fee_amount);
        transfer_impl(owner, passport, to, registry_addr);
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
    public fun status_labels(): (u8, u8, u8) {
        (STATUS_ACTIVE, STATUS_SUSPENDED, STATUS_REVOKED)
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
}
