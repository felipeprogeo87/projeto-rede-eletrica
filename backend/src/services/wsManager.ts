// =============================================================================
// Serviço: WebSocket para Progresso de Geração em Tempo Real
// =============================================================================

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface ClienteWS {
  ws: WebSocket;
  osId: number;
}

interface MensagemProgresso {
  tipo: 'etapa_inicio' | 'etapa_progresso' | 'etapa_concluido' | 'etapa_erro' | 
        'consulta_api' | 'progresso_geral' | 'concluido' | 'erro' | 'log';
  etapa?: string;
  descricao?: string;
  progresso?: number;
  detalhe?: string;
  tempoMs?: number;
  erro?: string;
  fonte?: string;
  url?: string;
  status?: string;
  resultado?: any;
  mensagem?: string;
  nivel?: 'info' | 'aviso' | 'erro' | 'sucesso';
}

// -----------------------------------------------------------------------------
// Gerenciador de WebSocket
// -----------------------------------------------------------------------------

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clientes: Map<number, Set<WebSocket>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Inicializa o servidor WebSocket
   */
  inicializar(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: any, req) => {
      console.log('[WS] Nova conexão');

      // Marcar como vivo para heartbeat
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });

      // Extrair osId da URL (ex: /ws?osId=123)
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const osIdParam = url.searchParams.get('osId');
      const osId = osIdParam ? parseInt(osIdParam, 10) : 0;

      if (osId > 0) {
        this.registrarCliente(osId, ws);
      }

      ws.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.tipo === 'subscribe' && msg.osId) {
            this.registrarCliente(msg.osId, ws);
          }
        } catch (e) {
          // Ignorar mensagens inválidas
        }
      });

      ws.on('close', () => {
        this.removerCliente(ws);
        console.log('[WS] Conexão fechada');
      });

      ws.on('error', (err: Error) => {
        console.error('[WS] Erro:', err.message);
        this.removerCliente(ws);
      });

      // Enviar confirmação
      ws.send(JSON.stringify({ tipo: 'conectado', mensagem: 'Conectado ao servidor' }));
    });

    // Heartbeat: verificar conexões mortas a cada 30s
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws: any) => {
        if (ws.isAlive === false) {
          this.removerCliente(ws);
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    console.log('[WS] Servidor WebSocket inicializado (heartbeat: 30s)');
  }

  /**
   * Registra cliente para receber atualizações de uma OS
   */
  private registrarCliente(osId: number, ws: WebSocket): void {
    if (!this.clientes.has(osId)) {
      this.clientes.set(osId, new Set());
    }
    this.clientes.get(osId)!.add(ws);
    console.log(`[WS] Cliente registrado para OS ${osId}`);
  }

  /**
   * Remove cliente de todas as listas
   */
  private removerCliente(ws: WebSocket): void {
    for (const [osId, clientes] of this.clientes.entries()) {
      clientes.delete(ws);
      if (clientes.size === 0) {
        this.clientes.delete(osId);
      }
    }
  }

  /**
   * Envia mensagem para todos os clientes de uma OS
   */
  enviar(osId: number, mensagem: MensagemProgresso): void {
    const clientes = this.clientes.get(osId);
    if (!clientes || clientes.size === 0) return;

    const dados = JSON.stringify(mensagem);
    
    for (const ws of clientes) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(dados);
      }
    }
  }

  /**
   * Envia início de etapa
   */
  etapaInicio(osId: number, etapa: string, descricao: string): void {
    this.enviar(osId, { tipo: 'etapa_inicio', etapa, descricao });
    this.log(osId, 'info', etapa, `Iniciando: ${descricao}`);
  }

  /**
   * Envia progresso de etapa
   */
  etapaProgresso(osId: number, etapa: string, progresso: number, detalhe?: string): void {
    this.enviar(osId, { tipo: 'etapa_progresso', etapa, progresso, detalhe });
  }

  /**
   * Envia conclusão de etapa
   */
  etapaConcluido(osId: number, etapa: string, tempoMs: number): void {
    this.enviar(osId, { tipo: 'etapa_concluido', etapa, tempoMs });
    this.log(osId, 'sucesso', etapa, `Concluído em ${tempoMs}ms`);
  }

  /**
   * Envia erro de etapa
   */
  etapaErro(osId: number, etapa: string, erro: string): void {
    this.enviar(osId, { tipo: 'etapa_erro', etapa, erro });
    this.log(osId, 'erro', etapa, erro);
  }

  /**
   * Envia informação de consulta a API
   */
  consultaAPI(osId: number, fonte: string, url: string, status: 'executando' | 'sucesso' | 'erro' | 'timeout', tempoMs?: number): void {
    this.enviar(osId, { tipo: 'consulta_api', fonte, url, status, tempoMs });
  }

  /**
   * Envia progresso geral
   */
  progressoGeral(osId: number, progresso: number): void {
    this.enviar(osId, { tipo: 'progresso_geral', progresso });
  }

  /**
   * Envia conclusão da geração
   */
  concluido(osId: number, resultado: any): void {
    this.enviar(osId, { tipo: 'concluido', resultado });
    this.log(osId, 'sucesso', 'Sistema', 'Geração concluída com sucesso!');
  }

  /**
   * Envia erro geral
   */
  erro(osId: number, mensagem: string): void {
    this.enviar(osId, { tipo: 'erro', mensagem });
    this.log(osId, 'erro', 'Sistema', mensagem);
  }

  /**
   * Envia log
   */
  log(osId: number, nivel: 'info' | 'aviso' | 'erro' | 'sucesso', fonte: string, mensagem: string): void {
    this.enviar(osId, { tipo: 'log', nivel, fonte, mensagem });
  }
}

// Exportar instância única
export const wsManager = new WebSocketManager();
export default wsManager;
