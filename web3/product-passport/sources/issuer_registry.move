module luxpass::issuer_registry {
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_framework::guid;
    use aptos_framework::signer;
    use aptos_framework::table::{Self, Table};

    // Error codes
    const E_ALREADY_INITIALIZED: u64 = 1;
    const E_NOT_ADMIN: u64 = 2;

    // Registry singleton stored under the admin address that calls `init()`
    struct IssuerRegistry has key {
        admin: address,
        issuers: Table<address, bool>,
        issuer_added_events: event::EventHandle<IssuerAdded>,
        issuer_removed_events: event::EventHandle<IssuerRemoved>,
    }

    // Event payloads
    struct IssuerAdded has drop, store { issuer: address }
    struct IssuerRemoved has drop, store { issuer: address }

    // Init the registry under `admin`
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

    // Checks if caller is admin
    fun assert_admin(reg: &IssuerRegistry, caller: address) {
        assert!(caller == reg.admin, E_NOT_ADMIN);
    }

    public entry fun add_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        let admin_addr = signer::address_of(admin);
        let reg = borrow_global_mut<IssuerRegistry>(admin_addr);
        assert_admin(reg, admin_addr);

        table::upsert(&mut reg.issuers, issuer, true);
        event::emit_event(&mut reg.issuer_added_events, IssuerAdded { issuer });
    }

    public entry fun remove_issuer(admin: &signer, issuer: address) acquires IssuerRegistry {
        let admin_addr = signer::address_of(admin);
        let reg = borrow_global_mut<IssuerRegistry>(admin_addr);
        assert_admin(reg, admin_addr);

        table::remove(&mut reg.issuers, issuer);
        event::emit_event(&mut reg.issuer_removed_events, IssuerRemoved { issuer });
    }

    // Read-only lookup: checks if `issuer` is currently allowlisted
    public fun is_issuer(registry_addr: address, issuer: address): bool acquires IssuerRegistry {
        if (!exists<IssuerRegistry>(registry_addr)) {
            return false;
        };
        let reg = borrow_global<IssuerRegistry>(registry_addr);
        table::contains(&reg.issuers, issuer)
    }

    // Returns the admin address for this registry
    public fun admin_of(registry_addr: address): address acquires IssuerRegistry {
        borrow_global<IssuerRegistry>(registry_addr).admin
    }

    // Expose event stream metadata for off-chain audit trail
    public fun issuer_added_handle(registry_addr: address): (guid::ID, u64) acquires IssuerRegistry {
        let h = &borrow_global<IssuerRegistry>(registry_addr).issuer_added_events;
        (guid::id(event::guid(h)), event::counter(h))
    }

    public fun issuer_removed_handle(registry_addr: address): (guid::ID, u64) acquires IssuerRegistry {
        let h = &borrow_global<IssuerRegistry>(registry_addr).issuer_removed_events;
        (guid::id(event::guid(h)), event::counter(h))
    }
}
