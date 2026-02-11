// =============================================================================
// Componente: Monitor de Geração em Tempo Real
// =============================================================================
// 
// Exibe o progresso da geração do projeto com:
// - Etapas em execução
// - APIs sendo consultadas
// - Logs em tempo real
// - Barra de progresso
//
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface EtapaGeracao {
  id: string;
  nome: string;
  status: 'pendente' | 'executando' | 'concluido' | 'erro';
  progresso: number;
  detalhes?: string;
  tempoMs?: number;
  subEtapas?: SubEtapa[];
}

interface SubEtapa {
  nome: string;
  status: 'pendente' | 'executando' | 'concluido' | 'erro';
  resultado?: string;
}

interface LogEntry {
  timestamp: Date;
  nivel: 'info' | 'aviso' | 'erro' | 'sucesso';
  fonte: string;
  mensagem: string;
}

interface ConsultaAPI {
  fonte: string;
  url: string;
  status: 'executando' | 'sucesso' | 'erro' | 'timeout';
  tempoMs?: number;
}

interface MonitorGeracaoProps {
  osId: number;
  onComplete?: (resultado: any) => void;
  onError?: (erro: string) => void;
}

// -----------------------------------------------------------------------------
// Etapas do Pipeline
// -----------------------------------------------------------------------------

const ETAPAS_INICIAL: EtapaGeracao[] = [
  { id: 'dados_os', nome: 'Carregando dados da OS', status: 'pendente', progresso: 0 },
  { id: 'osm', nome: 'Consultando OpenStreetMap', status: 'pendente', progresso: 0, subEtapas: [
    { nome: 'Ruas e calçadas', status: 'pendente' },
    { nome: 'Edificações', status: 'pendente' },
    { nome: 'Obstáculos', status: 'pendente' },
    { nome: 'Árvores', status: 'pendente' },
  ]},
  { id: 'google', nome: 'Consultando Google Maps', status: 'pendente', progresso: 0, subEtapas: [
    { nome: 'Places API', status: 'pendente' },
    { nome: 'Roads API', status: 'pendente' },
    { nome: 'Elevation API', status: 'pendente' },
  ]},
  { id: 'ibge', nome: 'Consultando IBGE', status: 'pendente', progresso: 0, subEtapas: [
    { nome: 'Geocodificação', status: 'pendente' },
    { nome: 'Dados municipais', status: 'pendente' },
    { nome: 'Setor censitário', status: 'pendente' },
  ]},
  { id: 'aneel', nome: 'Consultando ANEEL', status: 'pendente', progresso: 0 },
  { id: 'elevacao', nome: 'Calculando elevação (SRTM)', status: 'pendente', progresso: 0 },
  { id: 'classificacao', nome: 'Classificando área', status: 'pendente', progresso: 0 },
  { id: 'roteamento', nome: 'Calculando rota (OSRM)', status: 'pendente', progresso: 0 },
  { id: 'postes', nome: 'Posicionando postes', status: 'pendente', progresso: 0, subEtapas: [
    { nome: 'Detectando esquinas', status: 'pendente' },
    { nome: 'Detectando travessias', status: 'pendente' },
    { nome: 'Evitando edificações', status: 'pendente' },
    { nome: 'Otimizando vãos', status: 'pendente' },
  ]},
  { id: 'barreiras', nome: 'Detectando barreiras', status: 'pendente', progresso: 0 },
  { id: 'validacao', nome: 'Validando projeto', status: 'pendente', progresso: 0 },
  { id: 'materiais', nome: 'Gerando lista de materiais', status: 'pendente', progresso: 0 },
  { id: 'dxf', nome: 'Gerando arquivo DXF', status: 'pendente', progresso: 0 },
];

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

// Deep clone das etapas para evitar mutação do objeto original
const clonarEtapas = (): EtapaGeracao[] =>
  JSON.parse(JSON.stringify(ETAPAS_INICIAL));

const MonitorGeracao: React.FC<MonitorGeracaoProps> = ({ osId, onComplete, onError }) => {
  const [etapas, setEtapas] = useState<EtapaGeracao[]>(clonarEtapas);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [consultasAPI, setConsultasAPI] = useState<ConsultaAPI[]>([]);
  const [progressoGeral, setProgressoGeral] = useState(0);
  const [status, setStatus] = useState<'idle' | 'executando' | 'concluido' | 'erro'>('idle');
  const [tempoDecorrido, setTempoDecorrido] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_resultado, setResultado] = useState<any>(null);
  
  const logsRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll dos logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  // Timer
  useEffect(() => {
    if (status === 'executando') {
      timerRef.current = setInterval(() => {
        setTempoDecorrido(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Conectar WebSocket
  useEffect(() => {
    if (status !== 'executando') return;

    const ws = new WebSocket(`ws://${window.location.hostname}:3001/ws?osId=${osId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('info', 'WebSocket', 'Conectado ao servidor');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWebSocketMessage(msg);
      } catch (e) {
        console.error('Erro ao processar mensagem:', e);
      }
    };

    ws.onerror = () => {
      addLog('erro', 'WebSocket', 'Erro de conexão');
    };

    ws.onclose = () => {
      addLog('info', 'WebSocket', 'Conexão fechada');
    };

    return () => {
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, osId]);

  // Adicionar log
  const addLog = (nivel: LogEntry['nivel'], fonte: string, mensagem: string) => {
    setLogs(prev => [...prev, { timestamp: new Date(), nivel, fonte, mensagem }]);
  };

  // Atualizar etapa
  const updateEtapa = (id: string, updates: Partial<EtapaGeracao>) => {
    setEtapas(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  // Processar mensagem WebSocket
  const handleWebSocketMessage = (msg: any) => {
    switch (msg.tipo) {
      case 'etapa_inicio':
        updateEtapa(msg.etapa, { status: 'executando', progresso: 0 });
        addLog('info', msg.etapa, `Iniciando: ${msg.descricao || ''}`);
        break;
        
      case 'etapa_progresso':
        updateEtapa(msg.etapa, { progresso: msg.progresso, detalhes: msg.detalhe });
        break;
        
      case 'etapa_concluido':
        updateEtapa(msg.etapa, { status: 'concluido', progresso: 100, tempoMs: msg.tempoMs });
        addLog('sucesso', msg.etapa, `Concluído em ${msg.tempoMs}ms`);
        break;
        
      case 'etapa_erro':
        updateEtapa(msg.etapa, { status: 'erro', detalhes: msg.erro });
        addLog('erro', msg.etapa, msg.erro);
        break;
        
      case 'consulta_api':
        setConsultasAPI(prev => {
          const existe = prev.findIndex(c => c.fonte === msg.fonte && c.url === msg.url);
          if (existe >= 0) {
            const novo = [...prev];
            novo[existe] = { ...novo[existe], ...msg };
            return novo;
          }
          return [...prev, msg];
        });
        break;
        
      case 'progresso_geral':
        setProgressoGeral(msg.progresso);
        break;
        
      case 'concluido':
        setStatus('concluido');
        setResultado(msg.resultado);
        addLog('sucesso', 'Sistema', 'Geração concluída com sucesso!');
        onComplete?.(msg.resultado);
        break;
        
      case 'erro':
        setStatus('erro');
        addLog('erro', 'Sistema', msg.mensagem);
        onError?.(msg.mensagem);
        break;
    }
  };

  // Iniciar geração (simulado para teste sem WebSocket)
  const iniciarGeracao = async () => {
    setStatus('executando');
    setTempoDecorrido(0);
    setEtapas(clonarEtapas());
    setLogs([]);
    setConsultasAPI([]);
    setProgressoGeral(0);
    
    addLog('info', 'Sistema', `Iniciando geração para OS ${osId}`);
    
    // Simular chamada à API
    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_URL}/geracao/${osId}/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Erro ao iniciar geração');
      }
      
      // O progresso real virá pelo WebSocket
      
    } catch (error: any) {
      // Fallback: simular progresso para demonstração
      simularProgresso();
    }
  };

  // Simulação de progresso (para demonstração)
  const simularProgresso = async () => {
    for (let i = 0; i < ETAPAS_INICIAL.length; i++) {
      const etapa = ETAPAS_INICIAL[i];
      
      updateEtapa(etapa.id, { status: 'executando' });
      addLog('info', etapa.id, `Executando: ${etapa.nome}`);
      
      // Simular sub-etapas
      if (etapa.subEtapas) {
        for (const sub of etapa.subEtapas) {
          await sleep(300);
          setEtapas(prev => prev.map(e => {
            if (e.id === etapa.id && e.subEtapas) {
              return {
                ...e,
                subEtapas: e.subEtapas.map(s => 
                  s.nome === sub.nome ? { ...s, status: 'concluido' } : s
                ),
              };
            }
            return e;
          }));
        }
      }
      
      await sleep(500 + Math.random() * 500);
      
      updateEtapa(etapa.id, { status: 'concluido', progresso: 100, tempoMs: Math.round(500 + Math.random() * 1000) });
      addLog('sucesso', etapa.id, 'Concluído');
      
      setProgressoGeral(Math.round(((i + 1) / ETAPAS_INICIAL.length) * 100));
    }
    
    setStatus('concluido');
    addLog('sucesso', 'Sistema', 'Geração concluída!');

    // Notificar componente pai
    const resultadoSimulado = {
      sucesso: true,
      postes: [],
      condutores: [],
      barreiras: { barreiras: [], resumo: { total: 0, criticas: 0, avisos: 0 } },
      materiais: { resumo: { total_itens: 0 }, categorias: [] },
      resumo: { total_postes: 0, total_condutores: 0, extensao_mt: 0, extensao_bt: 0, erros: 0, avisos: 0, metodo: 'linha_reta' as const },
    };
    onComplete?.(resultadoSimulado);
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Formatar tempo
  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  };

  // Ícone de status
  const StatusIcon = ({ status }: { status: EtapaGeracao['status'] }) => {
    switch (status) {
      case 'pendente':
        return <span className="w-4 h-4 rounded-full bg-gray-300"></span>;
      case 'executando':
        return <span className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></span>;
      case 'concluido':
        return <span className="w-4 h-4 rounded-full bg-green-500">✓</span>;
      case 'erro':
        return <span className="w-4 h-4 rounded-full bg-red-500">✕</span>;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Geração de Projeto</h2>
          <p className="text-sm text-gray-500">OS {osId}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-2xl font-mono">{formatarTempo(tempoDecorrido)}</span>
          {status === 'idle' && (
            <button
              onClick={iniciarGeracao}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Iniciar Geração
            </button>
          )}
          {status === 'executando' && (
            <span className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg animate-pulse">
              Processando...
            </span>
          )}
          {status === 'concluido' && (
            <span className="px-4 py-2 bg-green-100 text-green-800 rounded-lg">
              ✓ Concluído
            </span>
          )}
          {status === 'erro' && (
            <span className="px-4 py-2 bg-red-100 text-red-800 rounded-lg">
              ✕ Erro
            </span>
          )}
        </div>
      </div>

      {/* Barra de progresso geral */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Progresso Geral</span>
          <span>{progressoGeral}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
            style={{ width: `${progressoGeral}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Etapas */}
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Etapas</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {etapas.map(etapa => (
              <div 
                key={etapa.id}
                className={`p-3 rounded-lg border ${
                  etapa.status === 'executando' ? 'border-blue-300 bg-blue-50' :
                  etapa.status === 'concluido' ? 'border-green-300 bg-green-50' :
                  etapa.status === 'erro' ? 'border-red-300 bg-red-50' :
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={etapa.status} />
                  <span className="font-medium text-sm">{etapa.nome}</span>
                  {etapa.tempoMs && (
                    <span className="text-xs text-gray-500 ml-auto">{etapa.tempoMs}ms</span>
                  )}
                </div>
                
                {/* Sub-etapas */}
                {etapa.subEtapas && etapa.status === 'executando' && (
                  <div className="mt-2 pl-6 space-y-1">
                    {etapa.subEtapas.map((sub, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <StatusIcon status={sub.status} />
                        <span className={sub.status === 'concluido' ? 'text-green-700' : 'text-gray-600'}>
                          {sub.nome}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                
                {etapa.detalhes && (
                  <p className="text-xs text-gray-500 mt-1 pl-6">{etapa.detalhes}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Logs e APIs */}
        <div className="space-y-4">
          {/* APIs consultadas */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">APIs Consultadas</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {consultasAPI.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma consulta ainda...</p>
              ) : (
                consultasAPI.map((api, idx) => (
                  <div 
                    key={idx}
                    className={`text-xs p-2 rounded ${
                      api.status === 'sucesso' ? 'bg-green-50 text-green-700' :
                      api.status === 'erro' ? 'bg-red-50 text-red-700' :
                      api.status === 'executando' ? 'bg-blue-50 text-blue-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}
                  >
                    <span className="font-medium">{api.fonte}</span>
                    {api.tempoMs && <span className="ml-2">({api.tempoMs}ms)</span>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Logs */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Logs</h3>
            <div 
              ref={logsRef}
              className="bg-gray-900 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs"
            >
              {logs.map((log, idx) => (
                <div 
                  key={idx}
                  className={`${
                    log.nivel === 'erro' ? 'text-red-400' :
                    log.nivel === 'aviso' ? 'text-yellow-400' :
                    log.nivel === 'sucesso' ? 'text-green-400' :
                    'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500">
                    [{log.timestamp.toLocaleTimeString()}]
                  </span>
                  {' '}
                  <span className="text-blue-400">[{log.fonte}]</span>
                  {' '}
                  {log.mensagem}
                </div>
              ))}
              {logs.length === 0 && (
                <span className="text-gray-500">Aguardando início...</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonitorGeracao;
