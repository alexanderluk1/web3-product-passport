import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("delist_requests", (table) => {
    table
      .uuid("id")
      .primary()
      .defaultTo(knex.raw("gen_random_uuid()"));

    // The on-chain passport object address — normalized to lowercase.
    table
      .text("passport_object_address")
      .references("passport_object_address")
      .inTable("listing_requests")
      .onDelete("CASCADE")
      .notNullable();
    
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    // On-chain owner address at the time the request was submitted.
    table
      .text("requester_address")
      .notNullable();

    // Shipping details — always required regardless of whether caller
    // is the seller or buyer.
    table.text("address_line1").notNullable();
    table.text("address_line2").nullable();
    table.text("city").notNullable();
    table.text("state").notNullable();
    table.text("postal_code").notNullable();
    table.text("country").notNullable();

    // pending   — owner has submitted delist request, Admin has not yet acted
    // processed — Admin has set passport to STATUS_RETURNING on-chain
    table
      .text("status")
      .notNullable()
      .defaultTo("pending");

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  // Lookup by passport address is the primary access pattern.
  await knex.schema.raw(
    "CREATE INDEX idx_delist_requests_passport ON delist_requests (passport_object_address)"
  );

  // Admin queue — filter pending requests.
  await knex.schema.raw(
    "CREATE INDEX idx_delist_requests_status ON delist_requests (status)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("delist_requests");
}