import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const regions = ['us-east-1','us-west-1','us-west-2','eu-central-1','eu-west-1','eu-west-2','eu-west-3','ap-southeast-1','ap-southeast-2','ap-northeast-1','ap-northeast-2','sa-east-1','ap-south-1','ca-central-1'];

const { SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_DB_PASSWORD) {
  throw new Error('Faltan SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD en .env');
}

async function test(region) {
  const connectionString = `postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:6543/postgres?sslmode=require`;
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch (e) {
    // console.log(region, e.message);
    return false;
  }
}

(async () => {
  console.log('Probando autenticación en todas las regiones...');
  for (const r of regions) {
    const ok = await test(r);
    if (ok) {
        console.log(`✅ Región correcta encontrada: ${r}`);
        process.exit(0);
    } else {
        console.log(`❌ ${r}`);
    }
  }
  console.log('No se pudo conectar en ninguna región.');
})();
