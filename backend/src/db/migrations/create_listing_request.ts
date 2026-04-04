import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("listing_requests", (table) => {
    table
      .uuid("id")
      .primary()
      .defaultTo(knex.raw("gen_random_uuid()"));

    // The on-chain passport object address — normalized to lowercase.
    table
      .text("passport_object_address")

    // On-chain owner address at the time the request was submitted.
    table
      .text("owner_address")
      .notNullable();

    // pending   — seller has submitted, LuxPass has not yet received
    // verifying — LuxPass is physically inspecting the item
    // listed    — passport set to STATUS_LISTING on-chain
    // returning  — LuxPass rejected the item after receiving the shipping address
    table
      .text("status")
      .notNullable()
      .defaultTo("pending");

      table
      .boolean("has_passport")
      .notNullable()
      .defaultTo(true);

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
    "CREATE INDEX idx_listing_requests_passport ON listing_requests (passport_object_address)"
  );

  // Admin queue — filter by status.
  await knex.schema.raw(
    "CREATE INDEX idx_listing_requests_status ON listing_requests (status)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("listing_requests");
}