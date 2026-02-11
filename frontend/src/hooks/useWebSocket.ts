// =============================================================================
// Hook: useWebSocket - Conexão WebSocket para progresso em tempo real
// =============================================================================
// @deprecated Este hook não é utilizado. O MonitorGeracao.tsx implementa
// sua própria lógica de WebSocket inline. Mantido para referência futura.
// =============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface EtapaGeracao {
  id: string;
  nome: string;
  status: 'pendente' | 'executando' | 'concluido' | 'erro';
  progresso: number;
  detalhes?: string;
  tempoMs?: number;
}

export interface LogEntry {
  timestamp: Date;
  nivel: 'info' | 'aviso' | 'erro' | 'sucesso';
  fonte: string;
  mensagem: string;
}

export interface ConsultaAPI {
  fonte: string;
  url: string;
  status: 'executando' | 'sucesso' | 'erro' | 'timeout';
  tempoMs?: number;
}

export interface WebSocketState {
  conectado: boolean;
  etapas: Map<string, EtapaGeracao>;
  logs: LogEntry[];
  consultasAPI: ConsultaAPI[];
  progressoGeral: number;
  status: 'idle' | 'executando' | 'concluido' | 'erro';
  resultado: any;
  erro: string | null;
}

// -----------------------------------------------------------------------------
// Etapas padrão
// -----------------------------------------------------------------------------

const ETAPAS_PADRAO: [string, string][] = [
  ['dados_os', 'Carregando dados da OS'],
  ['osm', 'Consultando OpenStreetMap'],
  ['google', 'Consultando Google Maps'],
  ['ibge', 'Consultando IBGE e ANEEL'],
  ['elevacao', 'Calculando elevação (SRTM)'],
  ['classificacao', 'Classificando tipo de área'],
  ['roteamento', 'Calculando rota inteligente'],
  ['postes', 'Posicionando postes'],
  ['validacao', 'Validando projeto'],
  ['saidas', 'Gerando arquivos de saída'],
];

// -----------------------------------------------------------------------------
// Hook Principal
// -----------------------------------------------------------------------------

export function useWebSocket(osId: number) {
  const [state, setState] = useState<WebSocketState>({
    conectado: false,
    etapas: new Map(ETAPAS_PADRAO.map(([id, nome]) => [id, {
      id,
      nome,
      status: 'pendente',
      progresso: 0,
    }])),
    logs: [],
    consultasAPI: [],
    progressoGeral: 0,
    status: 'idle',
    resultado: null,
    erro: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Adicionar log
  const addLog = useCallback((nivel: LogEntry['nivel'], fonte: string, mensagem: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { timestamp: new Date(), nivel, fonte, mensagem }],
    }));
  }, []);

  // Atualizar etapa
  const updateEtapa = useCallback((id: string, updates: Partial<EtapaGeracao>) => {
    setState(prev => {
      const novasEtapas = new Map(prev.etapas);
      const etapaAtual = novasEtapas.get(id);
      if (etapaAtual) {
        novasEtapas.set(id, { ...etapaAtual, ...updates });
      }
      return { ...prev, etapas: novasEtapas };
    });
  }, []);

  // Processar mensagem
  const processarMensagem = useCallback((msg: any) => {
    switch (msg.tipo) {
      case 'conectado':
        addLog('info', 'WebSocket', msg.mensagem || 'Conectado');
        break;

      case 'etapa_inicio':
        updateEtapa(msg.etapa, { status: 'executando', progresso: 0 });
        break;

      case 'etapa_progresso':
        updateEtapa(msg.etapa, { progresso: msg.progresso, detalhes: msg.detalhe });
        break;

      case 'etapa_concluido':
        updateEtapa(msg.etapa, { status: 'concluido', progresso: 100, tempoMs: msg.tempoMs });
        break;

      case 'etapa_erro':
        updateEtapa(msg.etapa, { status: 'erro', detalhes: msg.erro });
        break;

      case 'consulta_api':
        setState(prev => {
          const novasConsultas = [...prev.consultasAPI];
          const idx = novasConsultas.findIndex(c => c.fonte === msg.fonte && c.url === msg.url);
          const consulta: ConsultaAPI = {
            fonte: msg.fonte,
            url: msg.url,
            status: msg.status,
            tempoMs: msg.tempoMs,
          };
          if (idx >= 0) {
            novasConsultas[idx] = consulta;
          } else {
            novasConsultas.push(consulta);
          }
          return { ...prev, consultasAPI: novasConsultas };
        });
        break;

      case 'progresso_geral':
        setState(prev => ({ ...prev, progressoGeral: msg.progresso }));
        break;

      case 'log':
        addLog(msg.nivel || 'info', msg.fonte || 'Sistema', msg.mensagem);
        break;

      case 'concluido':
        setState(prev => ({
          ...prev,
          status: 'concluido',
          resultado: msg.resultado,
          progressoGeral: 100,
        }));
        addLog('sucesso', 'Sistema', 'Geração concluída com sucesso!');
        break;

      case 'erro':
        setState(prev => ({
          ...prev,
          status: 'erro',
          erro: msg.mensagem,
        }));
        addLog('erro', 'Sistema', msg.mensagem);
        break;
    }
  }, [addLog, updateEtapa]);

  // Conectar WebSocket
  const conectar = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `ws://${window.location.hostname}:3001/ws?osId=${osId}`;
    console.log('[WS] Conectando a:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Conectado');
      setState(prev => ({ ...prev, conectado: true }));
      addLog('sucesso', 'WebSocket', 'Conectado ao servidor');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        processarMensagem(msg);
      } catch (e) {
        console.error('[WS] Erro ao processar mensagem:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('[WS] Erro:', error);
      addLog('erro', 'WebSocket', 'Erro de conexão');
    };

    ws.onclose = () => {
      console.log('[WS] Desconectado');
      setState(prev => ({ ...prev, conectado: false }));
      
      // Tentar reconectar após 3 segundos se ainda estiver executando
      if (state.status === 'executando') {
        reconnectTimeoutRef.current = setTimeout(() => {
          conectar();
        }, 3000);
      }
    };
  }, [osId, addLog, processarMensagem, state.status]);

  // Desconectar WebSocket
  const desconectar = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Iniciar geração
  const iniciarGeracao = useCallback(async (config: any) => {
    // Resetar estado
    setState(prev => ({
      ...prev,
      etapas: new Map(ETAPAS_PADRAO.map(([id, nome]) => [id, {
        id,
        nome,
        status: 'pendente',
        progresso: 0,
      }])),
      logs: [],
      consultasAPI: [],
      progressoGeral: 0,
      status: 'executando',
      resultado: null,
      erro: null,
    }));

    // Conectar WebSocket
    conectar();

    // Chamar API para iniciar geração
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/geracao/${osId}/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error('Erro ao iniciar geração');
      }

      addLog('info', 'Sistema', 'Geração iniciada');
    } catch (error: any) {
      addLog('erro', 'Sistema', error.message);
      setState(prev => ({ ...prev, status: 'erro', erro: error.message }));
    }
  }, [osId, conectar, addLog]);

  // Cleanup
  useEffect(() => {
    return () => {
      desconectar();
    };
  }, [desconectar]);

  return {
    ...state,
    etapasArray: Array.from(state.etapas.values()),
    iniciarGeracao,
    conectar,
    desconectar,
  };
}

export default useWebSocket;
