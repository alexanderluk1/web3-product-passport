import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("purchase_orders", (table) => {
    table
      .uuid("id")
      .primary()
      .defaultTo(knex.raw("gen_random_uuid()"));

    table
      .text("passport_object_address")
      .references("passport_object_address")
      .inTable("listing_requests")
      .onDelete("CASCADE")
      .notNullable();

    table.text("buyer_address").notNullable();
    table.text("seller_address").notNullable();
    table.bigInteger("price_octas").notNullable();
    table.text("purchase_tx_hash").nullable();

    // pending            — purchase tx submitted, awaiting confirmation
    // completed          — purchase confirmed on-chain
    // delivery_requested — buyer wants physical item shipped
    // delivered          — physical item shipped by admin
    table
      .text("status")
      .notNullable()
      .defaultTo("pending");

    // Delivery address — filled when buyer requests physical delivery
    table.text("delivery_address_line1").nullable();
    table.text("delivery_address_line2").nullable();
    table.text("delivery_city").nullable();
    table.text("delivery_state").nullable();
    table.text("delivery_postal_code").nullable();
    table.text("delivery_country").nullable();

    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    "CREATE INDEX idx_purchase_orders_passport ON purchase_orders (passport_object_address)"
  );
  await knex.schema.raw(
    "CREATE INDEX idx_purchase_orders_buyer ON purchase_orders (buyer_address)"
  );
  await knex.schema.raw(
    "CREATE INDEX idx_purchase_orders_status ON purchase_orders (status)"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("purchase_orders");
}
