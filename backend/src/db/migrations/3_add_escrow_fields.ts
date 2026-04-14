import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("listing_requests", (table) => {
    // Escrow pricing — null means not yet priced for marketplace
    table.bigInteger("price_octas").nullable();
    table.text("escrow_tx_hash").nullable();
    table.boolean("in_escrow").notNullable().defaultTo(false);

    // Product details for no-passport workflow.
    // Admin fills these when receiving a physical item without passport;
    // reused at mint time to build IPFS metadata.
    table.text("product_name").nullable();
    table.text("brand").nullable();
    table.text("category").nullable();
    table.text("description").nullable();
    table.text("materials").nullable(); // comma-separated
    table.text("country_of_origin").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("listing_requests", (table) => {
    table.dropColumn("price_octas");
    table.dropColumn("escrow_tx_hash");
    table.dropColumn("in_escrow");
    table.dropColumn("product_name");
    table.dropColumn("brand");
    table.dropColumn("category");
    table.dropColumn("description");
    table.dropColumn("materials");
    table.dropColumn("country_of_origin");
  });
}
