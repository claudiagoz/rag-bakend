require('dotenv').config();
const net = require('net');
const regions = ['us-east-1','us-west-1','us-west-2','eu-central-1','eu-west-1','ap-southeast-1','ap-northeast-1','sa-east-1','ap-south-1','ca-central-1'];
const ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) throw new Error('Falta SUPABASE_PROJECT_REF en .env');

async function test(region) {
  return new Promise((resolve) => {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.connect(5432, host, () => { socket.destroy(); resolve({region, ok: true}); });
    socket.on('error', () => { socket.destroy(); resolve({region, ok: false}); });
    socket.on('timeout', () => { socket.destroy(); resolve({region, ok: false}); });
  });
}

(async () => {
  console.log('Probando regiones...');
  for (const r of regions) {
    const res = await test(r);
    console.log(res.ok ? '✅ ' + r : '❌ ' + r);
    if (res.ok) {
        console.log(`Region encontrada: ${r}`);
        break;
    }
  }
})();
