#[test_only]
module luxpass::passport_tests {
    use aptos_framework::account;
    use aptos_framework::object;
    use aptos_framework::object::Object;
    use aptos_framework::timestamp;
    use std::string;
    use std::signer;

    use luxpass::passport;
    use luxpass::issuer_registry;

    // -------------------------------------------------------------------------
    // Test constants
    // -------------------------------------------------------------------------

    const STATUS_ACTIVE: u8    = 1;
    const STATUS_SUSPENDED: u8 = 2;
    const STATUS_REVOKED: u8   = 3;
    const STATUS_STORING: u8   = 4;
    const STATUS_VERIFYING: u8 = 5;
    const STATUS_LISTING: u8   = 6;
    const STATUS_RETURNING: u8 = 7;

    // -------------------------------------------------------------------------
    // Test setup helpers
    // -------------------------------------------------------------------------

    // Set up the full infrastructure needed for every test:
    //   - Aptos framework (timestamp, account)
    //   - Admin account with PassportEvents + PassportIndex initialised
    //   - Issuer registered in issuer_registry
    //   - Owner account created
    fun setup(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        // Bootstrap Aptos framework time
        timestamp::set_time_has_started_for_testing(aptos_framework);

        // Create accounts
        let admin_addr  = signer::address_of(admin);
        let issuer_addr = signer::address_of(issuer);
        let owner_addr  = signer::address_of(owner);

        account::create_account_for_test(admin_addr);
        account::create_account_for_test(issuer_addr);
        account::create_account_for_test(owner_addr);

        // Bootstrap issuer_registry and register issuer under admin
        issuer_registry::init_registry(admin);
        issuer_registry::add_issuer(admin, issuer_addr);

        // Initialise passport infrastructure
        passport::init_events(admin);
        passport::init_index(admin);
    }

    // Mint a default passport and return its Object handle.
    fun mint_default(
        issuer: &signer,
        registry_addr: address,
        owner_addr: address,
    ): Object<passport::Passport> {
        let serial = b"SN-WATCH-001";
        let meta_uri = string::utf8(b"ipfs://Qm_watch_001");
        let meta_bytes = b"{}";
        passport::mint(issuer, registry_addr, owner_addr, serial, meta_uri, meta_bytes, true);
        let passport_addr = passport::passport_address_for_product_id(registry_addr, serial);
        object::address_to_object<passport::Passport>(passport_addr)
    }

    // =========================================================================
    // init_index
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass)]
    fun test_init_index_succeeds(aptos_framework: &signer, admin: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        account::create_account_for_test(signer::address_of(admin));
        issuer_registry::init_registry(admin);

        passport::init_events(admin);
        passport::init_index(admin);
        // If we reach here, both init calls succeeded — no abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass)]
    #[expected_failure(abort_code = passport::E_ALREADY_INITIALIZED)] // E_ALREADY_INITIALIZED
    fun test_init_index_aborts_when_called_twice(aptos_framework: &signer, admin: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        account::create_account_for_test(signer::address_of(admin));
        issuer_registry::init_registry(admin);

        passport::init_events(admin);
        passport::init_index(admin);
        passport::init_index(admin); // second call must abort
    }

    // =========================================================================
    // init_events
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass)]
    #[expected_failure(abort_code = passport::E_ALREADY_INITIALIZED)] // E_ALREADY_INITIALIZED
    fun test_init_events_aborts_when_called_twice(aptos_framework: &signer, admin: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        account::create_account_for_test(signer::address_of(admin));
        issuer_registry::init_registry(admin);

        passport::init_events(admin);
        passport::init_events(admin);
    }

    // =========================================================================
    // mint — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_creates_passport_with_active_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        let serial    = b"SN-001";
        let meta_uri  = string::utf8(b"ipfs://Qm001");
        let meta_bytes = b"{}";
        passport::mint(issuer, registry_addr, owner_addr, serial, meta_uri, meta_bytes, true);

        let passport_addr = passport::passport_address_for_product_id(registry_addr, serial);
        let (_, _, _, _, status, transferable, _) = passport::get_passport(passport_addr);

        assert!(status == STATUS_ACTIVE, 0);
        assert!(transferable == true, 1);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_non_transferable_passport(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint(issuer, registry_addr, owner_addr, b"SN-NT-001",
            string::utf8(b"ipfs://nt"), b"{}", false);

        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-NT-001");
        let (_, _, _, _, status, transferable, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_ACTIVE, 0);
        assert!(transferable == false, 1);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_indexes_serial_correctly(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        passport::mint(issuer, registry_addr, signer::address_of(owner),
            b"SN-INDEX", string::utf8(b"ipfs://idx"), b"{}", true);

        // Lookup via both raw bytes and the view function — both must succeed
        let addr1 = passport::passport_address_for_product_id(registry_addr, b"SN-INDEX");
        assert!(addr1 != @0x0, 0);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_records_correct_issuer(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let issuer_addr   = signer::address_of(issuer);

        passport::mint(issuer, registry_addr, signer::address_of(owner),
            b"SN-ISS", string::utf8(b"ipfs://iss"), b"{}", true);

        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-ISS");
        let (stored_issuer, _, _, _, _, _, _) = passport::get_passport(passport_addr);
        assert!(stored_issuer == issuer_addr, 0);
    }

    // =========================================================================
    // mint — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_ISSUER)] // E_NOT_ISSUER
    fun test_mint_aborts_when_caller_is_not_registered_issuer(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        // owner is not a registered issuer
        passport::mint(owner, registry_addr, signer::address_of(owner),
            b"SN-FAIL", string::utf8(b"ipfs://fail"), b"{}", true);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_DUPLICATE_PRODUCT_ID)] // E_DUPLICATE_PRODUCT_ID
    fun test_mint_aborts_on_duplicate_serial(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint(issuer, registry_addr, owner_addr, b"SN-DUP",
            string::utf8(b"ipfs://dup"), b"{}", true);
        passport::mint(issuer, registry_addr, owner_addr, b"SN-DUP",
            string::utf8(b"ipfs://dup2"), b"{}", true);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_INDEX_NOT_INITIALIZED)] // E_INDEX_NOT_INITIALIZED
    fun test_mint_aborts_when_index_not_initialized(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let admin_addr  = signer::address_of(admin);
        let issuer_addr = signer::address_of(issuer);
        account::create_account_for_test(admin_addr);
        account::create_account_for_test(issuer_addr);
        account::create_account_for_test(signer::address_of(owner));
        issuer_registry::init_registry(admin);
        issuer_registry::add_issuer(admin, issuer_addr);
        passport::init_events(admin); // events but NO index

        passport::mint(issuer, admin_addr, signer::address_of(owner),
            b"SN-NOIDX", string::utf8(b"ipfs://x"), b"{}", true);
    }

    // =========================================================================
    // mint_listing — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_listing_creates_passport_with_listing_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint_listing(
            admin, registry_addr, owner_addr,
            b"SN-ML-001", string::utf8(b"ipfs://ml001"), b"{}",
            string::utf8(b"temp_placeholder"),
        );

        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-ML-001");
        let (_, _, _, _, status, transferable, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_LISTING, 0);
        assert!(transferable == true, 1); // mint_listing always sets transferable
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_mint_listing_sets_issuer_to_admin(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let admin_addr    = signer::address_of(admin);

        passport::mint_listing(
            admin, registry_addr, signer::address_of(owner),
            b"SN-ML-ISS", string::utf8(b"ipfs://ml_iss"), b"{}",
            string::utf8(b"temp_iss"),
        );

        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-ML-ISS");
        let (stored_issuer, _, _, _, _, _, _) = passport::get_passport(passport_addr);
        assert!(stored_issuer == admin_addr, 0);
    }

    // =========================================================================
    // mint_listing — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_AUTHORIZED)] // E_NOT_AUTHORIZED
    fun test_mint_listing_aborts_when_caller_is_not_admin(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        // issuer is not the admin
        passport::mint_listing(
            issuer, registry_addr, signer::address_of(owner),
            b"SN-ML-FAIL", string::utf8(b"ipfs://fail"), b"{}",
            string::utf8(b"temp_fail"),
        );
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_DUPLICATE_PRODUCT_ID)] // E_DUPLICATE_PRODUCT_ID
    fun test_mint_listing_aborts_on_duplicate_serial(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint_listing(admin, registry_addr, owner_addr,
            b"SN-ML-DUP", string::utf8(b"ipfs://dup"), b"{}",
            string::utf8(b"t1"));
        passport::mint_listing(admin, registry_addr, owner_addr,
            b"SN-ML-DUP", string::utf8(b"ipfs://dup2"), b"{}",
            string::utf8(b"t2"));
    }

    // =========================================================================
    // transfer — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, recipient = @0xC)]
    fun test_transfer_active_transferable_passport_succeeds(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        recipient: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(recipient));
        let registry_addr  = signer::address_of(admin);
        let recipient_addr = signer::address_of(recipient);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::transfer(owner, pp, recipient_addr, registry_addr);

        // Recipient is now the owner
        assert!(object::is_owner(pp, recipient_addr), 0);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, recipient = @0xC)]
    fun test_transfer_listing_status_passport_succeeds(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        recipient: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(recipient));
        let registry_addr  = signer::address_of(admin);

        passport::mint_listing(
            admin, registry_addr, signer::address_of(owner),
            b"SN-TF-LIST", string::utf8(b"ipfs://tfl"), b"{}",
            string::utf8(b"temp"),
        );
        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-TF-LIST");
        let pp = object::address_to_object<passport::Passport>(passport_addr);

        passport::transfer(owner, pp, signer::address_of(recipient), registry_addr);
        assert!(object::is_owner(pp, signer::address_of(recipient)), 0);
    }

    // =========================================================================
    // transfer — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, thief = @0xC)]
    #[expected_failure(abort_code = passport::E_NOT_OWNER)] // E_NOT_OWNER
    fun test_transfer_aborts_when_caller_is_not_owner(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        thief: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(thief));
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::transfer(thief, pp, signer::address_of(thief), registry_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, recipient = @0xC)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE
    fun test_transfer_aborts_when_passport_is_not_transferable(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        recipient: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(recipient));
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint(issuer, registry_addr, owner_addr, b"SN-NT",
            string::utf8(b"ipfs://nt"), b"{}", false);
        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-NT");
        let pp = object::address_to_object<passport::Passport>(passport_addr);

        passport::transfer(owner, pp, signer::address_of(recipient), registry_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, recipient = @0xC)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE (status check)
    fun test_transfer_aborts_when_status_is_storing(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        recipient: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(recipient));
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        // list_passport sets status → STORING, which blocks transfer
        passport::list_passport(owner, pp, registry_addr);
        passport::transfer(owner, pp, signer::address_of(recipient), registry_addr);
    }

    // =========================================================================
    // list_passport — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_list_passport_sets_status_to_storing(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::list_passport(owner, pp, registry_addr);

        let passport_addr = object::object_address(&pp);
        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_STORING, 0);
    }

    // =========================================================================
    // list_passport — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, attacker = @0xC)]
    #[expected_failure(abort_code = passport::E_NOT_OWNER)] // E_NOT_OWNER
    fun test_list_passport_aborts_when_caller_is_not_owner(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        attacker: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(attacker));
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::list_passport(attacker, pp, registry_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE (non-transferable passport)
    fun test_list_passport_aborts_when_passport_is_not_transferable(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        passport::mint(issuer, registry_addr, owner_addr, b"SN-NT-LIST",
            string::utf8(b"ipfs://ntl"), b"{}", false);
        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-NT-LIST");
        let pp = object::address_to_object<passport::Passport>(passport_addr);

        passport::list_passport(owner, pp, registry_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE (status not ACTIVE)
    fun test_list_passport_aborts_when_already_listed(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::list_passport(owner, pp, registry_addr);  // status → STORING
        passport::list_passport(owner, pp, registry_addr);  // must abort: status != ACTIVE
    }

    // =========================================================================
    // delist_passport — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_delist_passport_restores_active_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let passport_addr_raw: address;

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport_addr_raw = object::object_address(&pp);

        // Simulate the full return flow: list → set_returning → delist
        passport::list_passport(owner, pp, registry_addr);
        passport::set_status(admin, passport_addr_raw, registry_addr, STATUS_RETURNING);
        passport::delist_passport(owner, pp, registry_addr);

        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr_raw);
        assert!(status == STATUS_ACTIVE, 0);
    }

    // =========================================================================
    // delist_passport — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE (status not RETURNING)
    fun test_delist_passport_aborts_when_not_in_returning_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        // Status is still ACTIVE — delist must abort
        passport::delist_passport(owner, pp, registry_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_TRANSFERABLE)] // E_NOT_TRANSFERABLE (status is STORING, not RETURNING)
    fun test_delist_passport_aborts_when_status_is_storing(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport::list_passport(owner, pp, registry_addr); // → STORING
        passport::delist_passport(owner, pp, registry_addr); // abort: not RETURNING
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, attacker = @0xC)]
    #[expected_failure(abort_code = passport::E_NOT_OWNER)] // E_NOT_OWNER
    fun test_delist_passport_aborts_when_caller_is_not_owner(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        attacker: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(attacker));
        let registry_addr   = signer::address_of(admin);
        let passport_addr_raw: address;

        let pp = mint_default(issuer, registry_addr, signer::address_of(owner));
        passport_addr_raw = object::object_address(&pp);
        passport::list_passport(owner, pp, registry_addr);
        passport::set_status(admin, passport_addr_raw, registry_addr, STATUS_RETURNING);
        passport::delist_passport(attacker, pp, registry_addr);
    }

    // =========================================================================
    // set_status — happy path (admin)
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_set_status_admin_can_set_any_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let statuses = vector[
            STATUS_SUSPENDED,
            STATUS_REVOKED,
            STATUS_STORING,
            STATUS_VERIFYING,
            STATUS_LISTING,
            STATUS_RETURNING,
            STATUS_ACTIVE,
        ];

        let pp    = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);

        let i = 0;
        while (i < 7) {
            let new_s = statuses[i];
            passport::set_status(admin, p_addr, registry_addr, new_s);
            let (_, _, _, _, status, _, _) = passport::get_passport(p_addr);
            assert!(status == new_s, i);
            i += 1;
        };
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_set_status_issuer_can_set_non_marketplace_statuses(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);

        passport::set_status(issuer, p_addr, registry_addr, STATUS_SUSPENDED);
        let (_, _, _, _, s1, _, _) = passport::get_passport(p_addr);
        assert!(s1 == STATUS_SUSPENDED, 0);

        passport::set_status(issuer, p_addr, registry_addr, STATUS_REVOKED);
        let (_, _, _, _, s2, _, _) = passport::get_passport(p_addr);
        assert!(s2 == STATUS_REVOKED, 1);

        passport::set_status(issuer, p_addr, registry_addr, STATUS_ACTIVE);
        let (_, _, _, _, s3, _, _) = passport::get_passport(p_addr);
        assert!(s3 == STATUS_ACTIVE, 2);
    }

    // =========================================================================
    // set_status — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_AUTHORIZED)] // E_NOT_AUTHORIZED
    fun test_set_status_aborts_when_issuer_tries_to_set_listing_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);
        passport::set_status(issuer, p_addr, registry_addr, STATUS_LISTING);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_AUTHORIZED)] // E_NOT_AUTHORIZED
    fun test_set_status_aborts_when_issuer_tries_to_set_storing_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);
        passport::set_status(issuer, p_addr, registry_addr, STATUS_STORING);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_PASSPORT_LISTED)] // E_PASSPORT_LISTED
    fun test_set_status_aborts_when_issuer_tries_to_change_a_listing_status(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);

        // Admin puts it into STORING
        passport::set_status(admin, p_addr, registry_addr, STATUS_STORING);
        // Issuer must not be able to touch it while it's in a marketplace status
        passport::set_status(issuer, p_addr, registry_addr, STATUS_ACTIVE);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, rando = @0xD)]
    #[expected_failure(abort_code = passport::E_NOT_AUTHORIZED)] // E_NOT_AUTHORIZED
    fun test_set_status_aborts_when_random_address_calls(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        rando: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(rando));
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);
        passport::set_status(rando, p_addr, registry_addr, STATUS_SUSPENDED);
    }

    // =========================================================================
    // update_metadata — happy path
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_update_metadata_by_admin_succeeds(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);
        let new_uri = string::utf8(b"ipfs://new_meta");

        passport::update_metadata(admin, p_addr, registry_addr, new_uri, b"{updated}");

        let (_, _, stored_uri, _, _, _, _) = passport::get_passport(p_addr);
        assert!(stored_uri == new_uri, 0);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_update_metadata_by_issuer_succeeds(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);
        let new_uri = string::utf8(b"ipfs://issuer_updated");

        passport::update_metadata(issuer, p_addr, registry_addr, new_uri, b"{v2}");

        let (_, _, stored_uri, _, _, _, _) = passport::get_passport(p_addr);
        assert!(stored_uri == new_uri, 0);
    }

    // =========================================================================
    // update_metadata — error cases
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_NOT_AUTHORIZED)] // E_NOT_AUTHORIZED
    fun test_update_metadata_aborts_when_caller_is_owner_not_issuer(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let pp     = mint_default(issuer, registry_addr, signer::address_of(owner));
        let p_addr = object::object_address(&pp);

        passport::update_metadata(owner, p_addr, registry_addr,
            string::utf8(b"ipfs://hack"), b"{}");
    }

    // =========================================================================
    // view: passport_address_for_product_id
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_passport_address_for_product_id_returns_correct_address(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        let serial = b"SN-VIEW-001";
        passport::mint(issuer, registry_addr, signer::address_of(owner),
            serial, string::utf8(b"ipfs://view"), b"{}", true);

        let passport_addr = passport::passport_address_for_product_id(registry_addr, serial);
        // Address must be non-zero and must actually hold a Passport
        assert!(passport_addr != @0x0, 0);
        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_ACTIVE, 1);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_PRODUCT_NOT_FOUND)] // E_PRODUCT_NOT_FOUND
    fun test_passport_address_for_product_id_aborts_for_unknown_serial(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);

        passport::passport_address_for_product_id(registry_addr, b"DOES-NOT-EXIST");
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    #[expected_failure(abort_code = passport::E_INDEX_NOT_INITIALIZED)] // E_INDEX_NOT_INITIALIZED
    fun test_passport_address_for_product_id_aborts_when_index_missing(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        // Setup WITHOUT calling init_index
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let admin_addr = signer::address_of(admin);
        account::create_account_for_test(admin_addr);
        account::create_account_for_test(signer::address_of(issuer));
        account::create_account_for_test(signer::address_of(owner));
        issuer_registry::init_registry(admin);
        passport::init_events(admin);
        // No init_index!

        passport::passport_address_for_product_id(admin_addr, b"SN-NO-IDX");
    }

    // =========================================================================
    // view: status_labels
    // =========================================================================

    #[test]
    fun test_status_labels_returns_correct_constants() {
        let (active, suspended, revoked, storing, verifying, listing, returning) =
            passport::status_labels();
        assert!(active    == 1, 0);
        assert!(suspended == 2, 1);
        assert!(revoked   == 3, 2);
        assert!(storing   == 4, 3);
        assert!(verifying == 5, 4);
        assert!(listing   == 6, 5);
        assert!(returning == 7, 6);
    }

    // =========================================================================
    // Full workflow integration: list → verify → return → delist
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB, buyer = @0xC)]
    fun test_full_listing_and_return_workflow(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
        buyer: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        account::create_account_for_test(signer::address_of(buyer));
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        // 1. Mint → ACTIVE
        let pp     = mint_default(issuer, registry_addr, owner_addr);
        let p_addr = object::object_address(&pp);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_ACTIVE, 0);

        // 2. Owner initiates listing → STORING
        passport::list_passport(owner, pp, registry_addr);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_STORING, 1);

        // 3. Admin receives product → VERIFYING
        passport::set_status(admin, p_addr, registry_addr, STATUS_VERIFYING);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_VERIFYING, 2);

        // 4. Admin verifies → LISTING
        passport::set_status(admin, p_addr, registry_addr, STATUS_LISTING);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_LISTING, 3);

        // 5. Transfer to buyer while listed (allowed)
        passport::transfer(owner, pp, signer::address_of(buyer), registry_addr);
        assert!(object::is_owner(pp, signer::address_of(buyer)), 4);

        // 6. Admin approves return → RETURNING (owner is now buyer)
        passport::set_status(admin, p_addr, registry_addr, STATUS_RETURNING);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_RETURNING, 5);

        // 7. Buyer confirms receipt → ACTIVE
        passport::delist_passport(buyer, pp, registry_addr);
        let (_, _, _, _, s, _, _) = passport::get_passport(p_addr);
        assert!(s == STATUS_ACTIVE, 6);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, issuer = @0xA, owner = @0xB)]
    fun test_full_no_passport_listing_workflow(
        aptos_framework: &signer,
        admin: &signer,
        issuer: &signer,
        owner: &signer,
    ) {
        setup(aptos_framework, admin, issuer, owner);
        let registry_addr = signer::address_of(admin);
        let owner_addr    = signer::address_of(owner);

        // 1. Admin mints + lists (mint_listing) directly at STATUS_LISTING
        passport::mint_listing(
            admin, registry_addr, owner_addr,
            b"SN-NP-WF", string::utf8(b"ipfs://np_wf"), b"{}",
            string::utf8(b"temp_placeholder_np"),
        );
        let passport_addr = passport::passport_address_for_product_id(registry_addr, b"SN-NP-WF");
        let pp = object::address_to_object<passport::Passport>(passport_addr);
        let (_, _, _, _, s, _, _) = passport::get_passport(passport_addr);
        assert!(s == STATUS_LISTING, 0);

        // 2. Admin approves return → RETURNING
        passport::set_status(admin, passport_addr, registry_addr, STATUS_RETURNING);
        let (_, _, _, _, s, _, _) = passport::get_passport(passport_addr);
        assert!(s == STATUS_RETURNING, 1);

        // 3. Owner confirms receipt → ACTIVE
        passport::delist_passport(owner, pp, registry_addr);
        let (_, _, _, _, s, _, _) = passport::get_passport(passport_addr);
        assert!(s == STATUS_ACTIVE, 2);
    }
}
