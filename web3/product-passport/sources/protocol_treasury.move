/// Protocol treasury: resource account that receives marketplace LPT and supplies APT
/// into escrow within the same user transaction (buyer signs once).
module luxpass::protocol_treasury {
    friend luxpass::escrow;

    use aptos_framework::account;
    use aptos_framework::aptos_account;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::signer;

    use luxpass::issuer_registry;

    const E_NOT_INITIALIZED: u64 = 200;
    const E_ALREADY_INITIALIZED: u64 = 201;
    const E_NOT_ADMIN: u64 = 202;
    const E_TREASURY_INSUFFICIENT_APT: u64 = 203;

    /// Lives on the registry admin account (same object as `EscrowState`).
    /// `treasury_address` is the resource account that receives LPT and holds APT float.
    struct ProtocolTreasury has key {
        signer_cap: account::SignerCapability,
        treasury_address: address,
        registry_addr: address,
    }

    fun assert_admin(registry_addr: address, caller: address) {
        let admin = issuer_registry::admin_of(registry_addr);
        assert!(caller == admin, E_NOT_ADMIN);
    }

    /// One-time: creates treasury resource account (APT + future LPT sink), stores cap on admin.
    public entry fun init_protocol_treasury(
        admin: &signer,
        registry_addr: address,
    ) {
        let admin_addr = signer::address_of(admin);
        assert_admin(registry_addr, admin_addr);
        assert!(!exists<ProtocolTreasury>(admin_addr), E_ALREADY_INITIALIZED);

        let (treasury_signer, signer_cap) = account::create_resource_account(
            admin,
            b"luxpass_protocol_treasury_v1",
        );
        let treasury_address = signer::address_of(&treasury_signer);
        coin::register<AptosCoin>(&treasury_signer);

        move_to(
            admin,
            ProtocolTreasury {
                signer_cap,
                treasury_address,
                registry_addr,
            },
        );
    }

    public fun is_initialized(admin_addr: address): bool {
        exists<ProtocolTreasury>(admin_addr)
    }

    /// LPT marketplace payments credit this address (`lux_pass_token` balance table).
    public fun lpt_sink_address(admin_addr: address): address acquires ProtocolTreasury {
        assert!(exists<ProtocolTreasury>(admin_addr), E_NOT_INITIALIZED);
        borrow_global<ProtocolTreasury>(admin_addr).treasury_address
    }

    // APT on the treasury resource account (fund via normal APT transfer to that address).
    #[view]
    public fun treasury_apt_balance(admin_addr: address): u64 acquires ProtocolTreasury {
        assert!(exists<ProtocolTreasury>(admin_addr), E_NOT_INITIALIZED);
        let t = borrow_global<ProtocolTreasury>(admin_addr);
        coin::balance<AptosCoin>(t.treasury_address)
    }

    #[view]
    public fun get_treasury_address(admin_addr: address): address acquires ProtocolTreasury {
        lpt_sink_address(admin_addr)
    }

    /// Only `escrow::purchase_with_lpt`: move APT from treasury resource account to `recipient`.
    public(friend) fun transfer_apt_to(
        admin_addr: address,
        recipient: address,
        amount: u64,
    ) acquires ProtocolTreasury {
        assert!(exists<ProtocolTreasury>(admin_addr), E_NOT_INITIALIZED);
        let t = borrow_global<ProtocolTreasury>(admin_addr);
        let bal = coin::balance<AptosCoin>(t.treasury_address);
        assert!(bal >= amount, E_TREASURY_INSUFFICIENT_APT);
        let ts = account::create_signer_with_capability(&t.signer_cap);
        aptos_account::transfer(&ts, recipient, amount);
    }
}
