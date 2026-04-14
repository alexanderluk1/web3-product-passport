module luxpass::escrow {
    use aptos_framework::account;
    use aptos_framework::aptos_account;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::event;
    use aptos_framework::object::{Self, Object};
    use aptos_framework::signer;
    use aptos_framework::table::{Self, Table};
    use aptos_framework::timestamp;

    use luxpass::passport::{Self, Passport};
    use luxpass::issuer_registry;
    use luxpass::lux_pass_token;
    use luxpass::protocol_treasury;

    // ── Error codes (100-series to avoid collision with passport 1-21) ──

    const E_NOT_INITIALIZED: u64        = 100;
    const E_ALREADY_INITIALIZED: u64    = 101;
    const E_NOT_ADMIN: u64              = 102;
    const E_NOT_SELLER: u64             = 103;
    const E_LISTING_NOT_FOUND: u64      = 104;
    const E_LISTING_ALREADY_EXISTS: u64 = 105;
    const E_INSUFFICIENT_PAYMENT: u64   = 106;
    const E_INVALID_PRICE: u64          = 107;
    const E_NOT_ACTIVE: u64             = 108;
    const E_SELF_PURCHASE: u64          = 110;
    /// Listing price in octas yields 0 LPT at fixed rate (too small).
    const E_LPT_AMOUNT_ZERO: u64        = 112;
    /// Call `protocol_treasury::init_protocol_treasury` before LPT purchases.
    const E_PROTOCOL_TREASURY_NOT_INIT: u64 = 113;

    /// 1 APT = 10^8 octas; fixed rate 1 APT = 100 LPT => LPT = price_octas * 100 / 10^8.
    const OCTAS_PER_APT: u64 = 100_000_000;
    const LPT_PER_APT: u64   = 100;

    // Passport status constant (must match passport.move)
    const STATUS_LISTING: u8 = 6;

    // ── Structs ──

    struct EscrowState has key {
        signer_cap: account::SignerCapability,
        escrow_address: address,
        registry_addr: address,
        listings: Table<address, EscrowListing>,
        listing_count: u64,
        total_volume_octas: u128,
    }

    struct EscrowListing has store, drop {
        seller: address,
        price_octas: u64,
        created_at_secs: u64,
        is_active: bool,
    }

    // ── Events ──

    struct ListingCreated has drop, store {
        passport: address,
        seller: address,
        price_octas: u64,
        escrow_address: address,
    }

    struct ListingCancelled has drop, store {
        passport: address,
        seller: address,
    }

    struct PurchaseCompleted has drop, store {
        passport: address,
        seller: address,
        buyer: address,
        price_octas: u64,
    }

    struct PriceUpdated has drop, store {
        passport: address,
        old_price_octas: u64,
        new_price_octas: u64,
    }

    struct EscrowEvents has key {
        listing_created: event::EventHandle<ListingCreated>,
        listing_cancelled: event::EventHandle<ListingCancelled>,
        purchase_completed: event::EventHandle<PurchaseCompleted>,
        price_updated: event::EventHandle<PriceUpdated>,
    }

    // ── Helpers ──

    fun assert_admin(registry_addr: address, caller: address) {
        let admin = issuer_registry::admin_of(registry_addr);
        assert!(caller == admin, E_NOT_ADMIN);
    }

    // ── Entry functions ──

    /// Initialize the escrow system. Creates a resource account that will
    /// hold passports and route APT payments.  Call once by admin.
    public entry fun init_escrow(
        admin: &signer,
        registry_addr: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert_admin(registry_addr, admin_addr);
        assert!(!exists<EscrowState>(admin_addr), E_ALREADY_INITIALIZED);

        let (escrow_signer, signer_cap) = account::create_resource_account(
            admin,
            b"luxpass_escrow_v1",
        );
        let escrow_address = signer::address_of(&escrow_signer);

        // Register the resource account so it can receive APT
        coin::register<AptosCoin>(&escrow_signer);

        move_to(admin, EscrowState {
            signer_cap,
            escrow_address,
            registry_addr,
            listings: table::new<address, EscrowListing>(),
            listing_count: 0,
            total_volume_octas: 0,
        });

        move_to(admin, EscrowEvents {
            listing_created: account::new_event_handle<ListingCreated>(admin),
            listing_cancelled: account::new_event_handle<ListingCancelled>(admin),
            purchase_completed: account::new_event_handle<PurchaseCompleted>(admin),
            price_updated: account::new_event_handle<PriceUpdated>(admin),
        });
    }

    /// Seller lists a passport for sale.  Passport must be at STATUS_LISTING
    /// and owned by the caller.  Transfers custody to the escrow resource account.
    public entry fun create_listing(
        seller: &signer,
        passport: Object<Passport>,
        admin_addr: address,
        price_octas: u64,
    ) acquires EscrowState, EscrowEvents {
        assert!(price_octas > 0, E_INVALID_PRICE);
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);

        let seller_addr = signer::address_of(seller);
        assert!(object::is_owner(passport, seller_addr), E_NOT_SELLER);

        let passport_addr = object::object_address(&passport);

        // Verify passport is in LISTING status
        let (_, _, _, _, status, _, _) = passport::get_passport(passport_addr);
        assert!(status == STATUS_LISTING, E_NOT_ACTIVE);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        if (table::contains(&state.listings, passport_addr)) {
        let existing_listing = table::borrow(&state.listings, passport_addr);
        assert!(
            !existing_listing.is_active,
            E_LISTING_ALREADY_EXISTS
            );
        };

        // Transfer passport to escrow resource account (custody)
        let registry_addr = state.registry_addr;
        let escrow_address = state.escrow_address;
        passport::transfer(seller, passport, escrow_address, registry_addr);

        // Record listing
        if (table::contains(&state.listings, passport_addr)) {
            let listing_ref = table::borrow_mut(&mut state.listings, passport_addr);
            assert!(!listing_ref.is_active, E_LISTING_ALREADY_EXISTS);
            
            // Update the existing entry with new listing details
            listing_ref.seller = seller_addr;
            listing_ref.price_octas = price_octas;
            listing_ref.is_active = true;
            listing_ref.created_at_secs = timestamp::now_seconds();
        } else{
                table::add(&mut state.listings, passport_addr, EscrowListing {
                    seller: seller_addr,
                    price_octas,
                    created_at_secs: timestamp::now_seconds(),
                    is_active: true,
                });
        };

        state.listing_count = state.listing_count + 1;

        // Emit event
        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.listing_created, ListingCreated {
            passport: passport_addr,
            seller: seller_addr,
            price_octas,
            escrow_address,
        });
    }

    /// Buyer purchases a listed passport.  APT is routed buyer → escrow → seller.
    /// Passport is transferred from escrow to buyer.  Atomic — all or nothing.
    public entry fun purchase(
        buyer: &signer,
        passport_addr: address,
        admin_addr: address,
    ) acquires EscrowState, EscrowEvents {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        let buyer_addr = signer::address_of(buyer);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow_mut(&mut state.listings, passport_addr);
        assert!(listing.is_active, E_NOT_ACTIVE);
        assert!(buyer_addr != listing.seller, E_SELF_PURCHASE);

        let price = listing.price_octas;
        let seller_addr = listing.seller;
        let escrow_address = state.escrow_address;
        let registry_addr = state.registry_addr;

        // Mark listing inactive before transfers (prevents re-entrancy patterns)
        listing.is_active = false;
        state.listing_count = state.listing_count - 1;
        state.total_volume_octas = state.total_volume_octas + (price as u128);

        // 1. Transfer APT: buyer → escrow resource account
        coin::transfer<AptosCoin>(buyer, escrow_address, price);

        // 2. Transfer APT: escrow → seller
        let escrow_signer = account::create_signer_with_capability(&state.signer_cap);
        aptos_account::transfer(&escrow_signer, seller_addr, price);

        // 2b. Listing flow left the passport at STATUS_LISTING; new owner must see ACTIVE to list again.
        passport::set_active_for_escrow_sale(passport_addr);

        // 3. Transfer passport: escrow → buyer
        let passport_obj = object::address_to_object<Passport>(passport_addr);
        passport::transfer(&escrow_signer, passport_obj, buyer_addr, registry_addr);

        // Emit event
        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.purchase_completed, PurchaseCompleted {
            passport: passport_addr,
            seller: seller_addr,
            buyer: buyer_addr,
            price_octas: price,
        });
    }

    /// Buyer pays LPT to the protocol treasury resource account at **100 LPT per 1 APT** of listing price.
    /// Treasury forwards **APT** to the escrow account, then escrow pays the seller (transient APT on escrow).
    /// Fund APT on the treasury resource address (`protocol_treasury::get_treasury_address`).
    public entry fun purchase_with_lpt(
        buyer: &signer,
        passport_addr: address,
        admin_addr: address,
        lpt_state_addr: address,
    ) acquires EscrowState, EscrowEvents {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        let buyer_addr = signer::address_of(buyer);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow_mut(&mut state.listings, passport_addr);
        assert!(listing.is_active, E_NOT_ACTIVE);
        assert!(buyer_addr != listing.seller, E_SELF_PURCHASE);

        let price = listing.price_octas;
        let seller_addr = listing.seller;
        let escrow_address = state.escrow_address;
        let registry_addr = state.registry_addr;

        let lpt_u128 = (price as u128) * (LPT_PER_APT as u128) / (OCTAS_PER_APT as u128);
        assert!(lpt_u128 > 0, E_LPT_AMOUNT_ZERO);
        let lpt_amount = (lpt_u128 as u64);

        listing.is_active = false;
        state.listing_count = state.listing_count - 1;
        state.total_volume_octas = state.total_volume_octas + (price as u128);

        assert!(protocol_treasury::is_initialized(admin_addr), E_PROTOCOL_TREASURY_NOT_INIT);
        let lpt_sink = protocol_treasury::lpt_sink_address(admin_addr);

        // 1. LPT: buyer -> protocol treasury resource account
        lux_pass_token::transfer_from_signer(buyer, lpt_state_addr, lpt_sink, lpt_amount);

        // 2. APT: protocol treasury -> escrow (transient), then escrow -> seller
        protocol_treasury::transfer_apt_to(admin_addr, escrow_address, price);
        let escrow_signer = account::create_signer_with_capability(&state.signer_cap);
        aptos_account::transfer(&escrow_signer, seller_addr, price);

        passport::set_active_for_escrow_sale(passport_addr);
        let passport_obj = object::address_to_object<Passport>(passport_addr);
        passport::transfer(&escrow_signer, passport_obj, buyer_addr, registry_addr);

        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.purchase_completed, PurchaseCompleted {
            passport: passport_addr,
            seller: seller_addr,
            buyer: buyer_addr,
            price_octas: price,
        });
    }

    /// Seller cancels their listing and reclaims the passport from escrow.
    public entry fun cancel_listing(
        seller: &signer,
        passport_addr: address,
        admin_addr: address,
    ) acquires EscrowState, EscrowEvents {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        let seller_addr = signer::address_of(seller);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow_mut(&mut state.listings, passport_addr);
        assert!(listing.is_active, E_NOT_ACTIVE);
        assert!(listing.seller == seller_addr, E_NOT_SELLER);

        let registry_addr = state.registry_addr;

        // Mark inactive
        listing.is_active = false;
        state.listing_count = state.listing_count - 1;

        // Return passport to seller
        let escrow_signer = account::create_signer_with_capability(&state.signer_cap);
        let passport_obj = object::address_to_object<Passport>(passport_addr);
        passport::transfer(&escrow_signer, passport_obj, seller_addr, registry_addr);

        // Emit event
        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.listing_cancelled, ListingCancelled {
            passport: passport_addr,
            seller: seller_addr,
        });
    }

    /// Update the price of an active escrow listing.
    public entry fun update_price(
        seller: &signer,
        passport_addr: address,
        admin_addr: address,
        new_price_octas: u64,
    ) acquires EscrowState, EscrowEvents {
        assert!(new_price_octas > 0, E_INVALID_PRICE);
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        let seller_addr = signer::address_of(seller);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow_mut(&mut state.listings, passport_addr);
        assert!(listing.is_active, E_NOT_ACTIVE);
        assert!(listing.seller == seller_addr, E_NOT_SELLER);

        let old_price = listing.price_octas;
        listing.price_octas = new_price_octas;

        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.price_updated, PriceUpdated {
            passport: passport_addr,
            old_price_octas: old_price,
            new_price_octas,
        });
    }

    /// Admin force-cancels a listing (dispute resolution).
    public entry fun admin_cancel_listing(
        admin: &signer,
        passport_addr: address,
        registry_addr: address,
    ) acquires EscrowState, EscrowEvents {
        let admin_addr = signer::address_of(admin);
        assert_admin(registry_addr, admin_addr);
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);

        let state = borrow_global_mut<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow_mut(&mut state.listings, passport_addr);
        assert!(listing.is_active, E_NOT_ACTIVE);

        let seller_addr = listing.seller;

        // Mark inactive
        listing.is_active = false;

        // Return passport to seller
        let escrow_signer = account::create_signer_with_capability(&state.signer_cap);
        let passport_obj = object::address_to_object<Passport>(passport_addr);
        passport::transfer(&escrow_signer, passport_obj, seller_addr, registry_addr);

        let ev = borrow_global_mut<EscrowEvents>(admin_addr);
        event::emit_event(&mut ev.listing_cancelled, ListingCancelled {
            passport: passport_addr,
            seller: seller_addr,
        });
    }

    // ── View functions ──

    #[view]
    public fun get_listing(
        admin_addr: address,
        passport_addr: address,
    ): (address, u64, u64, bool) acquires EscrowState {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        let state = borrow_global<EscrowState>(admin_addr);
        assert!(table::contains(&state.listings, passport_addr), E_LISTING_NOT_FOUND);
        let listing = table::borrow(&state.listings, passport_addr);
        (listing.seller, listing.price_octas, listing.created_at_secs, listing.is_active)
    }

    #[view]
    public fun get_escrow_address(admin_addr: address): address acquires EscrowState {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<EscrowState>(admin_addr).escrow_address
    }

    #[view]
    public fun get_listing_count(admin_addr: address): u64 acquires EscrowState {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<EscrowState>(admin_addr).listing_count
    }

    #[view]
    public fun get_total_volume(admin_addr: address): u128 acquires EscrowState {
        assert!(exists<EscrowState>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<EscrowState>(admin_addr).total_volume_octas
    }
}
