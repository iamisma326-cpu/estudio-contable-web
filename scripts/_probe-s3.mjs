import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
console.log(await sql.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1,2"));
