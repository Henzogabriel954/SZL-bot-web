const { spawn } = require('child_process');
require('dotenv').config();

// Monta a URL de conexão caso não esteja definida explicitamente
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const user = process.env.DB_USER || 'postgres';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || 'szl_bot_db';
const schema = process.env.DB_SCHEMA || 'public';

process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}?schema=${schema}`;

const args = process.argv.slice(2);

console.log(`[PRISMA] Executando comando: npx prisma ${args.join(' ')}`);

// Executa o Prisma
const prismaProcess = spawn('npx', ['prisma', ...args], {
  stdio: 'inherit',
  env: process.env
});

prismaProcess.on('close', (code) => {
  process.exit(code);
});
