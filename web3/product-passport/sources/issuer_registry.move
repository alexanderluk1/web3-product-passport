module luxpass::issuer_registry {
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::guid;
    use aptos_framework::signer;
    use aptos_framework::table::{Self, Table};

    const E_ALREADY_INITIALIZED: u64 = 1;
    const E_NOT_ADMIN: u64 = 2;
    const E_REGISTRY_NOT_FOUND: u64 = 3;
    const E_ISSUER_ALREADY_EXISTS: u64 = 4;

    struct IssuerRegistry has key {
        admin: address,
        issuers: Table<address, bool>,
        issuer_added_events: event::EventHandle<IssuerAdded>,
        issuer_removed_events: event::EventHandle<IssuerRemoved>,
    }

    struct IssuerAdded has drop, store { issuer: address }
    struct IssuerRemoved has drop, store { issuer: address }

    public entry fun init(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        assert!(!exists<IssuerRegistry>(admin_addr), E_ALREADY_INITIALIZED);

        move_to(
            admin,
            IssuerRegistry {
                admin: admin_addr,
                issuers: table::new<address, bool>(),
                issuer_added_events: account::new_event_handle<IssuerAdded>(admin),
                issuer_removed_events: account::new_event_handle<IssuerRemoved>(admin),
            },
        );
    }

    // Backward-compatible alias for older clients.
    public entry fun init_registry(admin: &signer) {
        init(admin);
    }

    fun assert_admin(reg: &IssuerRegistry, caller: address) {
        assert!(caller == reg.admin, E_NOT_ADMIN);
    }

    public entry fun add_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        let admin_addr = signer::address_of(admin);
        let reg = borrow_global_mut<IssuerRegistry>(admin_addr);
        assert_admin(reg, admin_addr);

        assert!(
            !table::contains(&reg.issuers, issuer),
            E_ISSUER_ALREADY_EXISTS
        );

        table::add(&mut reg.issuers, issuer, true);
        event::emit_event(&mut reg.issuer_added_events, IssuerAdded { issuer });
    }

    // Backward-compatible alias for older clients.
    public entry fun register_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        add_issuer(admin, issuer);
    }

    public entry fun remove_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        let admin_addr = signer::address_of(admin);
        let reg = borrow_global_mut<IssuerRegistry>(admin_addr);
        assert_admin(reg, admin_addr);

        table::remove(&mut reg.issuers, issuer);
        event::emit_event(&mut reg.issuer_removed_events, IssuerRemoved { issuer });
    }

    // Backward-compatible alias for older clients.
    public entry fun revoke_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        remove_issuer(admin, issuer);
    }

    public fun is_issuer(registry_addr: address, issuer: address): bool acquires IssuerRegistry {
        if (!exists<IssuerRegistry>(registry_addr)) {
            return false;
        };
        let reg = borrow_global<IssuerRegistry>(registry_addr);
        table::contains(&reg.issuers, issuer)
    }

    #[view]
    public fun get_registry(registry_addr: address): (address, u64, u64) acquires IssuerRegistry {
        assert!(exists<IssuerRegistry>(registry_addr), E_REGISTRY_NOT_FOUND);
        let reg = borrow_global<IssuerRegistry>(registry_addr);
        (
            reg.admin,
            event::counter(&reg.issuer_added_events),
            event::counter(&reg.issuer_removed_events),
        )
    }

    public fun admin_of(registry_addr: address): address acquires IssuerRegistry {
        borrow_global<IssuerRegistry>(registry_addr).admin
    }

    public fun issuer_added_handle(registry_addr: address): (guid::ID, u64) acquires IssuerRegistry {
        let h = &borrow_global<IssuerRegistry>(registry_addr).issuer_added_events;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun issuer_removed_handle(registry_addr: address): (guid::ID, u64) acquires IssuerRegistry {
        let h = &borrow_global<IssuerRegistry>(registry_addr).issuer_removed_events;
        (guid::id(event::guid(h)), event::counter(h))
    }
}
