module luxpass::lux_pass_token {
    use aptos_framework::account;
    use aptos_framework::event;
    use std::signer;
    use aptos_std::table::{Self, Table};

    const E_ALREADY_INITIALISED: u64 = 1;
    const E_NOT_ADMIN: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_SIGNUP_ALREADY_CLAIMED: u64 = 4;
    const E_REFERRAL_ALREADY_CLAIMED: u64 = 5;
    const E_SELF_REFERRAL: u64 = 6;
    const E_ZERO_AMOUNT: u64 = 7;
    const E_INSUFFICIENT_SUBSIDY_POOL: u64 = 8;

    // Core
    struct LPTState has key {
        admin: address,
        total_supply: u64,
        signup_reward_amount: u64,
        referral_reward_amount: u64,
        balances: Table<address, u64>,
        claimed_signup: Table<address, bool>,
        referral_claimed_for_referee: Table<address, bool>,
        subsidy_pool: u64,
        mint_events: event::EventHandle<Minted>,
        burn_events: event::EventHandle<Burned>,
        transfer_events: event::EventHandle<Transferred>,
        signup_events: event::EventHandle<SignupRewarded>,
        referral_events: event::EventHandle<ReferralRewarded>,
        fiat_events: event::EventHandle<FiatPurchaseCredited>,
        fee_events: event::EventHandle<PlatformFeePaid>,
        passport_burn_events: event::EventHandle<PassportServiceBurn>,
        subsidy_events: event::EventHandle<SubsidyPoolMove>,
    }

    // Event Structs
    struct Minted has drop, store {
        recipient: address,
        amount: u64,
        tag: u8,
    }

    struct Burned has drop, store {
        account: address,
        amount: u64,
    }

    struct Transferred has drop, store {
        from: address,
        to: address,
        amount: u64,
    }

    struct SignupRewarded has drop, store {
        user: address,
        amount: u64,
    }

    struct ReferralRewarded has drop, store {
        referrer: address,
        referee: address,
        amount_each: u64,
    }

    struct FiatPurchaseCredited has drop, store {
        buyer: address,
        amount: u64,
    }

    struct PlatformFeePaid has drop, store {
        payer: address,
        treasury: address,
        amount: u64,
    }

    struct PassportServiceBurn has drop, store {
        issuer: address,
        amount: u64,
    }

    struct SubsidyPoolMove has drop, store {
        kind: u8,
        account: address,
        amount: u64,
    }

    // mint::tag
    const MINT_TAG_ADMIN: u8 = 0;
    const MINT_TAG_SIGNUP: u8 = 1;
    const MINT_TAG_REFERRAL: u8 = 2;
    const MINT_TAG_FIAT: u8 = 3;

    //susbidy::kind
    const SUBSIDY_DEPOSIT: u8 = 0;
    const SUBSIDY_WITHDRAW: u8 = 1;

    // Init

    public entry fun initialise(
        admin: &signer,
        signup_reward_amount: u64,
        referral_reward_amount: u64,
    ) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<LPTState>(admin_addr), E_ALREADY_INITIALISED);

        move_to(
            admin,
            LPTState {
                admin: admin_addr,
                total_supply: 0,
                signup_reward_amount,
                referral_reward_amount,
                balances: table::new<address, u64>(),
                claimed_signup: table::new<address, bool>(),
                referral_claimed_for_referee: table::new<address, bool>(),
                subsidy_pool: 0,
                mint_events: account::new_event_handle<Minted>(admin),
                burn_events: account::new_event_handle<Burned>(admin),
                transfer_events: account::new_event_handle<Transferred>(admin),
                signup_events: account::new_event_handle<SignupRewarded>(admin),
                referral_events: account::new_event_handle<ReferralRewarded>(admin),
                fiat_events: account::new_event_handle<FiatPurchaseCredited>(admin),
                fee_events: account::new_event_handle<PlatformFeePaid>(admin),
                passport_burn_events: account::new_event_handle<PassportServiceBurn>(admin),
                subsidy_events: account::new_event_handle<SubsidyPoolMove>(admin),
            },
        );
    }

    // Views and tests

    #[view]
    public fun balance_of(state_addr: address, owner: address): u64 acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        if (!table::contains(&s.balances, owner)) {
            return 0
        };
        *table::borrow(&s.balances, owner)
    }

    #[view]
    public fun total_supply(state_addr: address): u64 acquires LPTState {
        borrow_global<LPTState>(state_addr).total_supply
    }

    #[view]
    public fun subsidy_pool_balance(state_addr: address): u64 acquires LPTState {
        borrow_global<LPTState>(state_addr).subsidy_pool
    }

    #[view]
    public fun get_reward_config(state_addr: address): (u64, u64) acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        (s.signup_reward_amount, s.referral_reward_amount)
    }

    #[view]
    public fun admin_of(state_addr: address): address acquires LPTState {
        borrow_global<LPTState>(state_addr).admin
    }

    #[test_only]
    public fun test_state_exists(state_addr: address): bool {
        exists<LPTState>(state_addr)
    }

    #[test_only]
    public fun test_signup_event_count(state_addr: address): u64 acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        event::counter(&s.signup_events)
    }

    #[test_only]
    public fun test_referral_event_count(state_addr: address): u64 acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        event::counter(&s.referral_events)
    }

    #[test_only]
    public fun test_subsidy_event_count(state_addr: address): u64 acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        event::counter(&s.subsidy_events)
    }

    #[test_only]
    public fun test_fee_event_count(state_addr: address): u64 acquires LPTState {
        let s = borrow_global<LPTState>(state_addr);
        event::counter(&s.fee_events)
    }

    // Core Supply ----------------------------------------------

    public entry fun mint(admin: &signer, state_addr: address, recipient: address, amount: u64) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let admin_addr = signer::address_of(admin);
        let s = borrow_global_mut<LPTState>(state_addr);
        assert_admin(s, admin_addr);
        mint_with_tag(s, recipient, amount, MINT_TAG_ADMIN);
    }

    public entry fun transfer(from: &signer, state_addr: address, to: address, amount: u64) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let s = borrow_global_mut<LPTState>(state_addr);
        let from_addr = signer::address_of(from);
        do_transfer(s, from_addr, to, amount);
    }

    /// Burn LPT from `issuer` and emit `PassportServiceBurn` (issuer-paid passport actions).
    public fun passport_burn(issuer: &signer, state_addr: address, amount: u64) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let s = borrow_global_mut<LPTState>(state_addr);
        let a = signer::address_of(issuer);
        burn_balance(s, a, amount);
        event::emit_event(
            &mut s.passport_burn_events,
            PassportServiceBurn { issuer: a, amount },
        );
    }

    /// Burn LPT from `owner` and emit `Burned` (e.g. owner-paid passport transfer fee).
    public fun transfer_burn(owner: &signer, state_addr: address, amount: u64) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let s = borrow_global_mut<LPTState>(state_addr);
        let addr = signer::address_of(owner);
        burn_balance(s, addr, amount);
        event::emit_event(&mut s.burn_events, Burned { account: addr, amount });
    }

    public entry fun burn(account: &signer, state_addr: address, amount: u64) acquires LPTState {
        transfer_burn(account, state_addr, amount);
    }

    // Supplemantery Supply ----------------------------------------------

    public entry fun claim_signup_reward(user: &signer, state_addr: address) acquires LPTState {
        let s = borrow_global_mut<LPTState>(state_addr);
        let u = signer::address_of(user);
        assert!(
            !table::contains(&s.claimed_signup, u),
            E_SIGNUP_ALREADY_CLAIMED
        );
        table::add(&mut s.claimed_signup, u, true);
        let amt = s.signup_reward_amount;
        assert!(amt > 0, E_ZERO_AMOUNT);
        mint_with_tag(s, u, amt, MINT_TAG_SIGNUP);
        event::emit_event(&mut s.signup_events, SignupRewarded { user: u, amount: amt });
    }

    public entry fun claim_referral_reward(
        referee: &signer,
        state_addr: address,
        referrer: address,
    ) acquires LPTState {
        let s = borrow_global_mut<LPTState>(state_addr);
        let r = signer::address_of(referee);
        assert!(referrer != r, E_SELF_REFERRAL);
        assert!(
            !table::contains(&s.referral_claimed_for_referee, r),
            E_REFERRAL_ALREADY_CLAIMED
        );
        table::add(&mut s.referral_claimed_for_referee, r, true);
        let amt = s.referral_reward_amount;
        assert!(amt > 0, E_ZERO_AMOUNT);
        mint_with_tag(s, referrer, amt, MINT_TAG_REFERRAL);
        mint_with_tag(s, r, amt, MINT_TAG_REFERRAL);
        event::emit_event(
            &mut s.referral_events,
            ReferralRewarded { referrer, referee: r, amount_each: amt },
        );
    }

    public entry fun credit_fiat_purchase(
        admin: &signer,
        state_addr: address,
        buyer: address,
        amount: u64,
    ) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let admin_addr = signer::address_of(admin);
        let s = borrow_global_mut<LPTState>(state_addr);
        assert_admin(s, admin_addr);
        mint_with_tag(s, buyer, amount, MINT_TAG_FIAT);
        event::emit_event(
            &mut s.fiat_events,
            FiatPurchaseCredited { buyer, amount },
        );
    }

    // Core Demand ----------------------------------------------

    public entry fun deposit_to_subsidy_pool(
        depositor: &signer,
        state_addr: address,
        amount: u64,
    ) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let s = borrow_global_mut<LPTState>(state_addr);
        let d = signer::address_of(depositor);
        debit_balance(s, d, amount);
        s.subsidy_pool = s.subsidy_pool + amount;
        event::emit_event(
            &mut s.subsidy_events,
            SubsidyPoolMove { kind: SUBSIDY_DEPOSIT, account: d, amount },
        );
    }

    public entry fun pay_platform_fee(
        payer: &signer,
        state_addr: address,
        treasury: address,
        amount: u64,
    ) acquires LPTState {
        charge_platform_fee(payer, state_addr, treasury, amount);
    }

    /// Charge gas-equivalent LPT fee from issuer to treasury.
    public fun passport_gas_fee(
        issuer: &signer,
        state_addr: address,
        treasury: address,
        amount: u64,
    ) acquires LPTState {
        charge_platform_fee(issuer, state_addr, treasury, amount);
    }

    /// Charge gas-equivalent LPT fee from owner to treasury.
    public fun transfer_gas_fee(
        owner: &signer,
        state_addr: address,
        treasury: address,
        amount: u64,
    ) acquires LPTState {
        charge_platform_fee(owner, state_addr, treasury, amount);
    }

    public entry fun burn_for_passport_service(
        issuer: &signer,
        state_addr: address,
        amount: u64,
    ) acquires LPTState {
        passport_burn(issuer, state_addr, amount);
    }

    // MISC Action ----------------------------------------------

    public entry fun allocate_subsidy(
        admin: &signer,
        state_addr: address,
        recipient: address,
        amount: u64,
    ) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let admin_addr = signer::address_of(admin);
        let s = borrow_global_mut<LPTState>(state_addr);
        assert_admin(s, admin_addr);
        assert!(s.subsidy_pool >= amount, E_INSUFFICIENT_SUBSIDY_POOL);
        s.subsidy_pool = s.subsidy_pool - amount;
        credit_balance(s, recipient, amount);
        event::emit_event(
            &mut s.subsidy_events,
            SubsidyPoolMove { kind: SUBSIDY_WITHDRAW, account: recipient, amount },
        );
    }

    // Internal helpers

    fun assert_admin(s: &LPTState, caller: address) {
        assert!(caller == s.admin, E_NOT_ADMIN);
    }

    fun mint_with_tag(s: &mut LPTState, recipient: address, amount: u64, tag: u8) {
        s.total_supply = s.total_supply + amount;
        credit_balance(s, recipient, amount);
        event::emit_event(
            &mut s.mint_events,
            Minted { recipient, amount, tag },
        );
    }

    fun credit_balance(s: &mut LPTState, account: address, amount: u64) {
        if (!table::contains(&s.balances, account)) {
            table::add(&mut s.balances, account, amount);
        } else {
            let b = table::borrow_mut(&mut s.balances, account);
            *b = *b + amount;
        };
    }

    fun debit_balance(s: &mut LPTState, account: address, amount: u64) {
        assert!(table::contains(&s.balances, account), E_INSUFFICIENT_BALANCE);
        let b = table::borrow_mut(&mut s.balances, account);
        assert!(*b >= amount, E_INSUFFICIENT_BALANCE);
        *b = *b - amount;
    }

    fun burn_balance(s: &mut LPTState, account: address, amount: u64) {
        debit_balance(s, account, amount);
        s.total_supply = s.total_supply - amount;
    }

    fun transfer_balances(s: &mut LPTState, from: address, to: address, amount: u64) {
        debit_balance(s, from, amount);
        credit_balance(s, to, amount);
    }

    fun do_transfer(s: &mut LPTState, from_addr: address, to: address, amount: u64) {
        transfer_balances(s, from_addr, to, amount);
        event::emit_event(
            &mut s.transfer_events,
            Transferred { from: from_addr, to, amount },
        );
    }

    fun charge_platform_fee(
        payer: &signer,
        state_addr: address,
        treasury: address,
        amount: u64,
    ) acquires LPTState {
        assert!(amount > 0, E_ZERO_AMOUNT);
        let s = borrow_global_mut<LPTState>(state_addr);
        let p = signer::address_of(payer);
        transfer_balances(s, p, treasury, amount);
        event::emit_event(
            &mut s.fee_events,
            PlatformFeePaid { payer: p, treasury, amount },
        );
    }
}
