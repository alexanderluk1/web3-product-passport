import knex from "knex";
 
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to your .env file.");
}
 
export const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
  // Knex uses snake_case column names — no conversion needed since
  // the schema is already defined in snake_case.
});