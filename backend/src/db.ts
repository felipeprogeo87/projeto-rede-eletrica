// =============================================================================
// Conexão com Banco de Dados PostgreSQL
// =============================================================================

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'rede_eletrica',
  user: process.env.DB_USER || 'dev',
  password: process.env.DB_PASSWORD || 'dev123',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Testar conexão
pool.on('connect', () => {
  console.log('[DB] Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[DB] Erro de conexão:', err.message);
});

export default pool;
