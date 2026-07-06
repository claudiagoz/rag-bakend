import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const { SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD } = process.env;
if (!SUPABASE_PROJECT_REF || !SUPABASE_DB_PASSWORD) {
  throw new Error('Faltan SUPABASE_PROJECT_REF / SUPABASE_DB_PASSWORD en .env');
}

const regions = [
  'sa-east-1', 
  'us-east-1', 
  'us-east-2', 
  'us-west-1', 
  'us-west-2', 
  'eu-central-1', 
  'eu-west-1', 
  'eu-west-2', 
  'eu-west-3', 
  'ap-southeast-1', 
  'ap-southeast-2', 
  'ap-northeast-1', 
  'ap-northeast-2', 
  'ap-south-1', 
  'ca-central-1'
];

async function findCorrectRegion() {
  console.log('Buscando la región correcta automáticamente...');
  
  for (const region of regions) {
    const url = `postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-${region}.pooler.supabase.com:6543/postgres?pgbouncer=true`;
    console.log(`Probando: ${region}...`);
    
    const prisma = new PrismaClient({
      datasources: {
        db: { url }
      }
    });

    try {
      // Intentamos hacer una consulta simple
      await prisma.tenant.findMany({ take: 1 });
      console.log(`\n🎉 ¡ÉXITO! La región correcta es: ${region}`);
      await prisma.$disconnect();
      return url;
    } catch (e) {
      // Ignoramos el error y probamos la siguiente
      await prisma.$disconnect();
    }
  }
  
  console.log('\n❌ No se pudo conectar en ninguna región.');
  return null;
}

findCorrectRegion();
