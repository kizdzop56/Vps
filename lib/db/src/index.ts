import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { pool } from "./client";

export { pool };
export const db = drizzle(pool, { schema });

export * from "./schema";
export { checkSchema, expectedTables, type SchemaCheck } from "./schema-check";
