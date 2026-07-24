require('dotenv').config();

// Monta a DATABASE_URL a partir das credenciais separadas no .env antes de instanciar o Prisma
if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'szl_bot_db';
  const schema = process.env.DB_SCHEMA || 'public';

  process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}?schema=${schema}`;
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = prisma;
