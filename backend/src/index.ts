// =============================================================================
// Backend: Servidor Express + WebSocket
// =============================================================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { wsManager } from './services/wsManager';
import pool from './db';

// Rotas
import osRoutes from './routes/osRoutes';
import geracaoRoutes from './routes/geracaoRoutes';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sem origin (ex: curl, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origem ${origin} não permitida`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Inicializar WebSocket
wsManager.inicializar(server);

// Rotas da API
app.use('/api/os', osRoutes);
app.use('/api/geracao', geracaoRoutes);

// Rota de health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString(),
      websocket: 'enabled'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro:', err.message, err.stack);
  // Não vazar detalhes internos (stack traces, paths) para o cliente
  const isProduction = process.env.NODE_ENV === 'production';
  const mensagem = isProduction ? 'Erro interno do servidor' : err.message;
  res.status(500).json({ error: mensagem });
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[${signal}] Encerrando servidor...`);
  server.close(() => {
    console.log('[SHUTDOWN] Servidor HTTP fechado');
  });
  try {
    await pool.end();
    console.log('[SHUTDOWN] Pool de conexões encerrado');
  } catch (err) {
    console.error('[SHUTDOWN] Erro ao fechar pool:', err);
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Iniciar servidor
server.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`WebSocket habilitado em ws://localhost:${PORT}/ws`);
  console.log(`${'='.repeat(50)}\n`);
});

export default app;
