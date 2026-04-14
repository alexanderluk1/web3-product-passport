import type { Knex } from "knex";
import "dotenv/config";

const config: { [key: string]: Knex.Config } = {
  development: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: "./src/db/migrations",
      extension: "ts",
      loadExtensions: [".ts"],
    },
    seeds: {
      directory: "./src/db/seeds",
    },
  },

  production: {
    client: "pg",
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: "./src/db/migrations",
      extension: "ts",
      loadExtensions: [".ts"],
    },
  },
};

export default config;