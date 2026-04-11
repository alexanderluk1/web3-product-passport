#[test_only]
module luxpass::lux_pass_token_tests {
    use luxpass::lux_pass_token;
    use std::signer;

    const SIGNUP_REWARD: u64 = 10;
    const REFERRAL_REWARD: u64 = 7;

    #[test(admin = @0xA11CE)]
    fun test_init_creates_state(admin: signer) {
        let admin_addr = @0xA11CE;
        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        assert!(lux_pass_token::test_state_exists(admin_addr));
    }

    #[test(admin = @0xA11CE, recipient = @0xB0B)]
    fun test_mint_increases_supply_and_recipient(admin: signer, recipient: signer) {
        let admin_addr = signer::address_of(&admin);
        let recipient_addr = signer::address_of(&recipient);
        let amount = 50;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        let supply_before = lux_pass_token::total_supply(admin_addr);
        let recipient_before = lux_pass_token::balance_of(admin_addr, recipient_addr);
        lux_pass_token::mint(&admin, admin_addr, recipient_addr, amount);
        let supply_after = lux_pass_token::total_supply(admin_addr);
        let recipient_after = lux_pass_token::balance_of(admin_addr, recipient_addr);

        assert!(supply_after == supply_before + amount);
        assert!(recipient_after == recipient_before + amount);
    }

    #[test(admin = @0xA11CE, sender = @0xC0DE, recipient = @0xD00D)]
    fun test_transfer_moves_balance(sender: signer, recipient: signer, admin: signer) {
        let admin_addr = signer::address_of(&admin);
        let sender_addr = signer::address_of(&sender);
        let recipient_addr = signer::address_of(&recipient);
        let amount = 25;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        lux_pass_token::mint(&admin, admin_addr, sender_addr, 100);

        let sender_before = lux_pass_token::balance_of(admin_addr, sender_addr);
        let recipient_before = lux_pass_token::balance_of(admin_addr, recipient_addr);
        lux_pass_token::transfer(&sender, admin_addr, recipient_addr, amount);
        let sender_after = lux_pass_token::balance_of(admin_addr, sender_addr);
        let recipient_after = lux_pass_token::balance_of(admin_addr, recipient_addr);

        assert!(sender_after == sender_before - amount);
        assert!(recipient_after == recipient_before + amount);
    }

    #[test(admin = @0xA11CE, caller = @0xB007)]
    fun test_burn_decreases_caller_and_supply(caller: signer, admin: signer) {
        let admin_addr = signer::address_of(&admin);
        let caller_addr = signer::address_of(&caller);
        let amount = 40;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        lux_pass_token::mint(&admin, admin_addr, caller_addr, 100);

        let supply_before = lux_pass_token::total_supply(admin_addr);
        let caller_before = lux_pass_token::balance_of(admin_addr, caller_addr);
        lux_pass_token::burn(&caller, admin_addr, amount);
        let supply_after = lux_pass_token::total_supply(admin_addr);
        let caller_after = lux_pass_token::balance_of(admin_addr, caller_addr);

        assert!(caller_after == caller_before - amount);
        assert!(supply_after == supply_before - amount);
    }

    #[test(admin = @0xA11CE, user = @0x1111)]
    fun test_claim_signup_reward_increases_user_and_emits(user: signer, admin: signer) {
        let admin_addr = signer::address_of(&admin);
        let user_addr = signer::address_of(&user);

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        let user_before = lux_pass_token::balance_of(admin_addr, user_addr);
        let event_before = lux_pass_token::test_signup_event_count(admin_addr);
        lux_pass_token::claim_signup_reward(&user, admin_addr);
        let user_after = lux_pass_token::balance_of(admin_addr, user_addr);
        let event_after = lux_pass_token::test_signup_event_count(admin_addr);

        assert!(user_after == user_before + SIGNUP_REWARD);
        assert!(event_after == event_before + 1);
    }

    #[test(admin = @0xA11CE, referee = @0x2222, referrer = @0x3333)]
    fun test_claim_referral_reward_increases_both_and_emits(
        referee: signer,
        referrer: signer,
        admin: signer,
    ) {
        let admin_addr = signer::address_of(&admin);
        let referee_addr = signer::address_of(&referee);
        let referrer_addr = signer::address_of(&referrer);

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        let referee_before = lux_pass_token::balance_of(admin_addr, referee_addr);
        let referrer_before = lux_pass_token::balance_of(admin_addr, referrer_addr);
        let event_before = lux_pass_token::test_referral_event_count(admin_addr);
        lux_pass_token::claim_referral_reward(&referee, admin_addr, referrer_addr);
        let referee_after = lux_pass_token::balance_of(admin_addr, referee_addr);
        let referrer_after = lux_pass_token::balance_of(admin_addr, referrer_addr);
        let event_after = lux_pass_token::test_referral_event_count(admin_addr);

        assert!(referee_after == referee_before + REFERRAL_REWARD);
        assert!(referrer_after == referrer_before + REFERRAL_REWARD);
        assert!(event_after == event_before + 1);
    }

    #[test(admin = @0xA11CE, depositor = @0x4444)]
    fun test_deposit_to_subsidy_pool_moves_balance_and_emits(depositor: signer, admin: signer) {
        let admin_addr = signer::address_of(&admin);
        let depositor_addr = signer::address_of(&depositor);
        let amount = 30;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        lux_pass_token::mint(&admin, admin_addr, depositor_addr, 100);

        let depositor_before = lux_pass_token::balance_of(admin_addr, depositor_addr);
        let pool_before = lux_pass_token::subsidy_pool_balance(admin_addr);
        let event_before = lux_pass_token::test_subsidy_event_count(admin_addr);
        lux_pass_token::deposit_to_subsidy_pool(&depositor, admin_addr, amount);
        let depositor_after = lux_pass_token::balance_of(admin_addr, depositor_addr);
        let pool_after = lux_pass_token::subsidy_pool_balance(admin_addr);
        let event_after = lux_pass_token::test_subsidy_event_count(admin_addr);

        assert!(depositor_after == depositor_before - amount);
        assert!(pool_after == pool_before + amount);
        assert!(event_after == event_before + 1);
    }

    #[test(admin = @0xA11CE, payer = @0x5555, treasury = @0x6666)]
    fun test_pay_platform_fee_moves_balance_and_emits(
        payer: signer,
        treasury: signer,
        admin: signer,
    ) {
        let admin_addr = signer::address_of(&admin);
        let payer_addr = signer::address_of(&payer);
        let treasury_addr = signer::address_of(&treasury);
        let amount = 20;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        lux_pass_token::mint(&admin, admin_addr, payer_addr, 100);

        let payer_before = lux_pass_token::balance_of(admin_addr, payer_addr);
        let treasury_before = lux_pass_token::balance_of(admin_addr, treasury_addr);
        let event_before = lux_pass_token::test_fee_event_count(admin_addr);
        lux_pass_token::pay_platform_fee(&payer, admin_addr, treasury_addr, amount);
        let payer_after = lux_pass_token::balance_of(admin_addr, payer_addr);
        let treasury_after = lux_pass_token::balance_of(admin_addr, treasury_addr);
        let event_after = lux_pass_token::test_fee_event_count(admin_addr);

        assert!(payer_after == payer_before - amount);
        assert!(treasury_after == treasury_before + amount);
        assert!(event_after == event_before + 1);
    }

    #[test(admin = @0xA11CE, depositor = @0x7777, recipient = @0x8888)]
    fun test_allocate_subsidy_moves_pool_and_recipient(
        depositor: signer,
        recipient: signer,
        admin: signer,
    ) {
        let admin_addr = signer::address_of(&admin);
        let depositor_addr = signer::address_of(&depositor);
        let recipient_addr = signer::address_of(&recipient);
        let amount = 15;

        lux_pass_token::initialise(&admin, SIGNUP_REWARD, REFERRAL_REWARD);
        lux_pass_token::mint(&admin, admin_addr, depositor_addr, 100);
        lux_pass_token::deposit_to_subsidy_pool(&depositor, admin_addr, 40);

        let pool_before = lux_pass_token::subsidy_pool_balance(admin_addr);
        let recipient_before = lux_pass_token::balance_of(admin_addr, recipient_addr);
        let event_before = lux_pass_token::test_subsidy_event_count(admin_addr);
        lux_pass_token::allocate_subsidy(&admin, admin_addr, recipient_addr, amount);
        let pool_after = lux_pass_token::subsidy_pool_balance(admin_addr);
        let recipient_after = lux_pass_token::balance_of(admin_addr, recipient_addr);
        let event_after = lux_pass_token::test_subsidy_event_count(admin_addr);

        assert!(pool_after == pool_before - amount);
        assert!(recipient_after == recipient_before + amount);
        assert!(event_after == event_before + 1);
    }
}
