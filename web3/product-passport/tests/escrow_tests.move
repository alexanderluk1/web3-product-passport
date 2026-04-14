#[test_only]
module luxpass::escrow_tests {
    use aptos_framework::account;
    use aptos_framework::aptos_coin;
    use aptos_framework::coin;
    use aptos_framework::object;
    use aptos_framework::timestamp;
    use std::signer;
    use std::string;

    use luxpass::escrow;
    use luxpass::issuer_registry;
    use luxpass::lux_pass_token;
    use luxpass::passport;
    use luxpass::protocol_treasury;

    // Mirror of passport status constants
    const STATUS_ACTIVE: u8  = 1;
    const STATUS_LISTING: u8 = 6;

    // Price: 1 APT = 100_000_000 octas
    const ONE_APT: u64 = 100_000_000;

    // ── Setup helpers ──

    /// Full setup: framework time, accounts, issuer registry, passport infra, escrow.
    /// Returns (admin_addr, seller_addr, buyer_addr).
    fun setup(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ): (address, address, address) {
        // Bootstrap Aptos framework
        timestamp::set_time_has_started_for_testing(aptos_framework);

        let admin_addr  = signer::address_of(admin);
        let seller_addr = signer::address_of(seller);
        let buyer_addr  = signer::address_of(buyer);

        // Create accounts
        account::create_account_for_test(admin_addr);
        account::create_account_for_test(seller_addr);
        account::create_account_for_test(buyer_addr);

        // Initialize APT coin for testing and fund accounts
        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);

        // Register accounts for APT
        coin::register<aptos_coin::AptosCoin>(admin);
        coin::register<aptos_coin::AptosCoin>(seller);
        coin::register<aptos_coin::AptosCoin>(buyer);

        // Mint APT to buyer (needs funds to purchase)
        let buyer_coins = coin::mint<aptos_coin::AptosCoin>(10 * ONE_APT, &mint_cap);
        coin::deposit(buyer_addr, buyer_coins);

        // Mint some APT to seller too (for gas / testing)
        let seller_coins = coin::mint<aptos_coin::AptosCoin>(5 * ONE_APT, &mint_cap);
        coin::deposit(seller_addr, seller_coins);

        // Clean up capabilities
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        // Initialize issuer registry + register admin as issuer (so they can mint_listing)
        issuer_registry::init_registry(admin);
        issuer_registry::add_issuer(admin, admin_addr);

        // Initialize passport infra
        passport::init_events(admin);
        passport::init_index(admin);

        // Initialize escrow
        escrow::init_escrow(admin, admin_addr);

        (admin_addr, seller_addr, buyer_addr)
    }

    /// Mint a passport at STATUS_LISTING owned by seller using mint_listing (admin mints for seller).
    fun mint_listed_passport(
        admin: &signer,
        admin_addr: address,
        seller_addr: address,
        serial: vector<u8>,
    ): address {
        passport::mint_listing(
            admin,
            admin_addr,
            seller_addr,
            serial,
            string::utf8(b"ipfs://QmTest"),
            b"{}",
            string::utf8(b"temp_placeholder"),
        );
        passport::passport_address_for_product_id(admin_addr, serial)
    }

    // =========================================================================
    // init_escrow
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass)]
    fun test_init_escrow(aptos_framework: &signer, admin: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let admin_addr = signer::address_of(admin);
        account::create_account_for_test(admin_addr);

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        issuer_registry::init_registry(admin);
        passport::init_events(admin);
        passport::init_index(admin);

        escrow::init_escrow(admin, admin_addr);

        // Verify escrow was initialized
        let escrow_addr = escrow::get_escrow_address(admin_addr);
        assert!(escrow_addr != @0x0, 0);
        assert!(escrow::get_listing_count(admin_addr) == 0, 1);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass)]
    #[expected_failure(abort_code = escrow::E_ALREADY_INITIALIZED)]
    fun test_init_escrow_twice_fails(aptos_framework: &signer, admin: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let admin_addr = signer::address_of(admin);
        account::create_account_for_test(admin_addr);

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        issuer_registry::init_registry(admin);
        passport::init_events(admin);
        passport::init_index(admin);

        escrow::init_escrow(admin, admin_addr);
        escrow::init_escrow(admin, admin_addr); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, non_admin = @0xBAD)]
    #[expected_failure(abort_code = escrow::E_NOT_ADMIN)]
    fun test_init_escrow_not_admin_fails(
        aptos_framework: &signer,
        admin: &signer,
        non_admin: &signer,
    ) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        let admin_addr = signer::address_of(admin);
        account::create_account_for_test(admin_addr);
        account::create_account_for_test(signer::address_of(non_admin));

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        issuer_registry::init_registry(admin);
        passport::init_events(admin);
        passport::init_index(admin);

        escrow::init_escrow(non_admin, admin_addr); // must abort: not admin
    }

    // =========================================================================
    // create_listing
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_create_listing(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);

        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-ESC-001");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);

        // Verify seller owns it
        assert!(object::is_owner(passport_obj, seller_addr), 0);

        // Create escrow listing
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Verify passport is now owned by escrow
        let escrow_addr = escrow::get_escrow_address(admin_addr);
        assert!(object::is_owner(passport_obj, escrow_addr), 1);

        // Verify listing data
        let (listed_seller, price, _, is_active) = escrow::get_listing(admin_addr, passport_addr);
        assert!(listed_seller == seller_addr, 2);
        assert!(price == ONE_APT, 3);
        assert!(is_active == true, 4);
        assert!(escrow::get_listing_count(admin_addr) == 1, 5);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_INVALID_PRICE)]
    fun test_create_listing_zero_price_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-ZERO");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, 0); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_NOT_SELLER)]
    fun test_create_listing_not_owner_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-NOTOWN");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        // Buyer tries to list seller's passport
        escrow::create_listing(buyer, passport_obj, admin_addr, ONE_APT); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_NOT_ACTIVE)]
    fun test_create_listing_wrong_status_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);

        // Mint a regular passport (STATUS_ACTIVE, not STATUS_LISTING)
        issuer_registry::add_issuer(admin, seller_addr);
        passport::mint(
            seller, admin_addr, seller_addr,
            b"SN-ACTIVE", string::utf8(b"ipfs://active"), b"{}", true,
        );
        let passport_addr = passport::passport_address_for_product_id(admin_addr, b"SN-ACTIVE");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);

        // Status is ACTIVE, not LISTING — must abort
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);
    }

    // =========================================================================
    // purchase
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_purchase_success(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, buyer_addr) = setup(aptos_framework, admin, seller, buyer);

        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-BUY");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);

        // Seller lists at 2 APT
        let price = 2 * ONE_APT;
        escrow::create_listing(seller, passport_obj, admin_addr, price);

        // Record balances before purchase
        let seller_bal_before = coin::balance<aptos_coin::AptosCoin>(seller_addr);
        let buyer_bal_before = coin::balance<aptos_coin::AptosCoin>(buyer_addr);

        // Buyer purchases
        escrow::purchase(buyer, passport_addr, admin_addr);

        // Verify passport transferred to buyer
        assert!(object::is_owner(passport_obj, buyer_addr), 0);

        // Secondary sale must leave passport ACTIVE so buyer can `list_passport` again
        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_ACTIVE, 5);

        // Verify APT transferred
        let seller_bal_after = coin::balance<aptos_coin::AptosCoin>(seller_addr);
        let buyer_bal_after = coin::balance<aptos_coin::AptosCoin>(buyer_addr);
        assert!(seller_bal_after == seller_bal_before + price, 1);
        assert!(buyer_bal_after == buyer_bal_before - price, 2);

        // Verify listing is inactive
        let (_, _, _, is_active) = escrow::get_listing(admin_addr, passport_addr);
        assert!(is_active == false, 3);

        // Verify volume tracked
        assert!(escrow::get_total_volume(admin_addr) == (price as u128), 4);
    }

    // LPT purchase path: buyer pays LPT to treasury; seller receives APT from escrow float.
    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_purchase_with_lpt_success(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        timestamp::set_time_has_started_for_testing(aptos_framework);

        let admin_addr = signer::address_of(admin);
        let seller_addr = signer::address_of(seller);
        let buyer_addr = signer::address_of(buyer);

        account::create_account_for_test(admin_addr);
        account::create_account_for_test(seller_addr);
        account::create_account_for_test(buyer_addr);

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::register<aptos_coin::AptosCoin>(admin);
        coin::register<aptos_coin::AptosCoin>(seller);
        coin::register<aptos_coin::AptosCoin>(buyer);

        let buyer_coins = coin::mint<aptos_coin::AptosCoin>(10 * ONE_APT, &mint_cap);
        coin::deposit(buyer_addr, buyer_coins);
        let seller_coins = coin::mint<aptos_coin::AptosCoin>(5 * ONE_APT, &mint_cap);
        coin::deposit(seller_addr, seller_coins);

        issuer_registry::init_registry(admin);
        issuer_registry::add_issuer(admin, admin_addr);
        passport::init_events(admin);
        passport::init_index(admin);
        lux_pass_token::initialise(admin, 1, 1);
        escrow::init_escrow(admin, admin_addr);
        protocol_treasury::init_protocol_treasury(admin, admin_addr);

        let treasury_addr = protocol_treasury::get_treasury_address(admin_addr);
        let treasury_float = coin::mint<aptos_coin::AptosCoin>(50 * ONE_APT, &mint_cap);
        coin::deposit(treasury_addr, treasury_float);

        lux_pass_token::mint(admin, admin_addr, buyer_addr, 10_000);

        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-LPT");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        let price = 2 * ONE_APT;
        escrow::create_listing(seller, passport_obj, admin_addr, price);

        let seller_bal_before = coin::balance<aptos_coin::AptosCoin>(seller_addr);
        let treasury_lpt_before = lux_pass_token::balance_of(admin_addr, treasury_addr);

        escrow::purchase_with_lpt(buyer, passport_addr, admin_addr, admin_addr);

        assert!(object::is_owner(passport_obj, buyer_addr), 0);
        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_ACTIVE, 1);

        let seller_bal_after = coin::balance<aptos_coin::AptosCoin>(seller_addr);
        assert!(seller_bal_after == seller_bal_before + price, 2);

        // 2 APT -> 200 LPT at 100 LPT / APT
        let treasury_lpt_after = lux_pass_token::balance_of(admin_addr, treasury_addr);
        assert!(treasury_lpt_after == treasury_lpt_before + 200, 3);

        let (_, _, _, is_active) = escrow::get_listing(admin_addr, passport_addr);
        assert!(is_active == false, 4);

        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = protocol_treasury::E_TREASURY_INSUFFICIENT_APT)]
    fun test_purchase_with_lpt_fails_without_treasury_apt(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        timestamp::set_time_has_started_for_testing(aptos_framework);

        let admin_addr = signer::address_of(admin);
        let seller_addr = signer::address_of(seller);
        let buyer_addr = signer::address_of(buyer);

        account::create_account_for_test(admin_addr);
        account::create_account_for_test(seller_addr);
        account::create_account_for_test(buyer_addr);

        let (burn_cap, mint_cap) = aptos_coin::initialize_for_test(aptos_framework);
        coin::register<aptos_coin::AptosCoin>(admin);
        coin::register<aptos_coin::AptosCoin>(seller);
        coin::register<aptos_coin::AptosCoin>(buyer);

        let buyer_coins = coin::mint<aptos_coin::AptosCoin>(10 * ONE_APT, &mint_cap);
        coin::deposit(buyer_addr, buyer_coins);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);

        issuer_registry::init_registry(admin);
        issuer_registry::add_issuer(admin, admin_addr);
        passport::init_events(admin);
        passport::init_index(admin);
        lux_pass_token::initialise(admin, 1, 1);
        escrow::init_escrow(admin, admin_addr);
        protocol_treasury::init_protocol_treasury(admin, admin_addr);
        // Treasury has no APT — purchase_with_lpt must abort when forwarding APT to escrow

        lux_pass_token::mint(admin, admin_addr, buyer_addr, 10_000);

        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-NOAPT");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        escrow::purchase_with_lpt(buyer, passport_addr, admin_addr, admin_addr);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_SELF_PURCHASE)]
    fun test_purchase_self_buy_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-SELF");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Seller tries to buy own listing
        escrow::purchase(seller, passport_addr, admin_addr); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure] // INSUFFICIENT_BALANCE from coin framework
    fun test_purchase_insufficient_funds_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-BROKE");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);

        // Price exceeds buyer's balance (buyer has 10 APT, price is 20 APT)
        escrow::create_listing(seller, passport_obj, admin_addr, 20 * ONE_APT);
        escrow::purchase(buyer, passport_addr, admin_addr); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_NOT_ACTIVE)]
    fun test_purchase_already_sold_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-SOLD");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // First purchase succeeds
        escrow::purchase(buyer, passport_addr, admin_addr);
        // Second purchase must abort (inactive)
        escrow::purchase(buyer, passport_addr, admin_addr);
    }

    // =========================================================================
    // cancel_listing
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_cancel_listing(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-CANCEL");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Verify escrow owns it
        let escrow_addr = escrow::get_escrow_address(admin_addr);
        assert!(object::is_owner(passport_obj, escrow_addr), 0);

        // Cancel
        escrow::cancel_listing(seller, passport_addr, admin_addr);

        // Verify passport returned to seller
        assert!(object::is_owner(passport_obj, seller_addr), 1);

        // Verify listing inactive
        let (_, _, _, is_active) = escrow::get_listing(admin_addr, passport_addr);
        assert!(is_active == false, 2);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_NOT_SELLER)]
    fun test_cancel_listing_not_seller_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-NOCANC");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Buyer tries to cancel seller's listing
        escrow::cancel_listing(buyer, passport_addr, admin_addr); // must abort
    }

    // =========================================================================
    // admin_cancel_listing
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_admin_cancel_listing(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-ADMIN");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Admin force-cancels
        escrow::admin_cancel_listing(admin, passport_addr, admin_addr);

        // Passport returned to seller
        assert!(object::is_owner(passport_obj, seller_addr), 0);

        let (_, _, _, is_active) = escrow::get_listing(admin_addr, passport_addr);
        assert!(is_active == false, 1);
    }

    // =========================================================================
    // update_price
    // =========================================================================

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    fun test_update_price(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-PRICE");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);

        // Update price to 3 APT
        let new_price = 3 * ONE_APT;
        escrow::update_price(seller, passport_addr, admin_addr, new_price);

        let (_, price, _, _) = escrow::get_listing(admin_addr, passport_addr);
        assert!(price == new_price, 0);
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_INVALID_PRICE)]
    fun test_update_price_zero_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-P0");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);
        escrow::update_price(seller, passport_addr, admin_addr, 0); // must abort
    }

    #[test(aptos_framework = @aptos_framework, admin = @luxpass, seller = @0xA, buyer = @0xB)]
    #[expected_failure(abort_code = escrow::E_NOT_SELLER)]
    fun test_update_price_not_seller_fails(
        aptos_framework: &signer,
        admin: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        let (admin_addr, seller_addr, _) = setup(aptos_framework, admin, seller, buyer);
        let passport_addr = mint_listed_passport(admin, admin_addr, seller_addr, b"SN-PNS");
        let passport_obj = object::address_to_object<passport::Passport>(passport_addr);
        escrow::create_listing(seller, passport_obj, admin_addr, ONE_APT);
        escrow::update_price(buyer, passport_addr, admin_addr, 2 * ONE_APT); // must abort
    }
}
