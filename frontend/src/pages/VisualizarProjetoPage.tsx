// =============================================================================
// Página: VisualizarProjetoPage
// Visualização completa do projeto com mapa sempre visível
// =============================================================================
//
// Layout unificado com 4 estados:
// 1. Loading — spinner
// 2. Pronto — mapa com pins origem/destino + painel de configuração abaixo
// 3. Gerando — mapa + barra de progresso abaixo
// 4. Resultado — mapa com projeto + sidebars + perfil altimétrico abaixo
//
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MapaProjeto, {
  PosteGerado,
  CondutorGerado,
  Barreira,
  CamadasVisiveis,
  Coordenada,
  MarcadorExtra,
} from '../components/MapaProjeto';
import PerfilAltimetrico from '../components/PerfilAltimetrico';
import PainelResumo from '../components/PainelResumo';
import ControleCamadas from '../components/ControleCamadas';
import './VisualizarProjetoPage.css';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface OS {
  id: number;
  numero_os: string;
  cliente_nome?: string;
  municipio?: string;
  estado?: string;
  tipo_rede?: string;
  ponto_origem_latitude: number | string;
  ponto_origem_longitude: number | string;
  ponto_destino_latitude: number | string;
  ponto_destino_longitude: number | string;
  status: string;
}

interface PerfilData {
  pontos: { lat: number; lng: number; elevacao: number }[];
  elevacaoMinima: number;
  elevacaoMaxima: number;
  desnivelTotal: number;
  decliveMaximo: number;
}

interface ResultadoGeracao {
  sucesso: boolean;
  postes: PosteGerado[];
  condutores: CondutorGerado[];
  barreiras: {
    barreiras: Barreira[];
    resumo: { total: number; criticas: number; avisos: number };
  };
  materiais: {
    resumo: { total_itens: number; peso_total_kg?: number };
    categorias?: { categoria: string; quantidade: number }[];
    itens?: any[];
  };
  perfil: PerfilData;
  resumo: {
    total_postes: number;
    total_condutores: number;
    extensao_mt: number;
    extensao_bt: number;
    erros: number;
    avisos: number;
    metodo: 'osm' | 'linha_reta';
    tipo_area?: string;
    vao_utilizado?: number;
  };
  validacao_detalhes?: {
    erros: string[];
    avisos: string[];
  };
}

interface ConfigGeracao {
  tipo_rede: string;
  natureza: string;
  tensao_mt: number;
  condutor_mt: string;
  com_bt: boolean;
  tipo_area_forcado?: string;
  usar_google_maps: boolean;
  usar_ibge: boolean;
}

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Helper para converter coordenadas (string ou number)
const toNum = (val: number | string): number =>
  typeof val === 'string' ? parseFloat(val) : val;

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const VisualizarProjetoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const osId = parseInt(id || '0', 10);

  // Estado principal
  const [os, setOS] = useState<OS | null>(null);
  const [resultado, setResultado] = useState<ResultadoGeracao | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [posteSelecionado, setPosteSelecionado] = useState<PosteGerado | null>(null);

  // Camadas do mapa
  const [camadas, setCamadas] = useState<CamadasVisiveis>({
    postes: true,
    condutoresMT: true,
    condutoresBT: true,
    barreiras: true,
    terreno: false,
    rota: true,
  });

  // Configuração de geração
  const [config, setConfig] = useState<ConfigGeracao>({
    tipo_rede: 'mt_convencional',
    natureza: 'TRIFASICA',
    tensao_mt: 13.8,
    condutor_mt: '1/0 AWG',
    com_bt: true,
    usar_google_maps: false,
    usar_ibge: false,
  });

  // ---------------------------------------------------------------------------
  // Carregar dados da OS
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const carregarOS = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/os/${osId}`);
        if (!response.ok) throw new Error('OS não encontrada');

        const data = await response.json();
        const osData = data?.data || data;
        setOS(osData);

        // Pré-configurar tipo_rede baseado na OS
        if (osData.tipo_rede) {
          setConfig(prev => ({ ...prev, tipo_rede: osData.tipo_rede }));
        }
      } catch (err: any) {
        setErro(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (osId) {
      carregarOS();
    }
  }, [osId]);

  // ---------------------------------------------------------------------------
  // Gerar projeto (endpoint síncrono)
  // ---------------------------------------------------------------------------

  const gerarProjeto = useCallback(async () => {
    if (!osId) return;

    setGerando(true);
    setErro(null);
    setResultado(null); // Limpar resultado anterior

    try {
      const response = await fetch(`${API_BASE_URL}/os/${osId}/gerar-projeto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao gerar projeto');
      }

      const data = await response.json();
      setResultado(data?.data || data);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGerando(false);
    }
  }, [osId, config]);

  // ---------------------------------------------------------------------------
  // Ações de download
  // ---------------------------------------------------------------------------

  const downloadDXF = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/geracao/${osId}/dxf`);
      if (!response.ok) throw new Error('Erro ao baixar DXF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `projeto_${os?.numero_os || osId}.dxf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err: any) {
      alert('Erro ao baixar DXF: ' + err.message);
    }
  };

  const downloadMateriais = async () => {
    if (!resultado?.materiais?.itens) return;
    const headers = 'Código;Descrição;Unidade;Quantidade;Categoria\n';
    const rows = resultado.materiais.itens
      .map((item: any) =>
        `${item.codigo};${item.descricao};${item.unidade};${item.quantidade};${item.categoria}`
      )
      .join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais_${os?.numero_os || osId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const salvarProjeto = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/os/${osId}/salvar-projeto`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Erro ao salvar projeto');

      alert('Projeto salvo com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // Dados computados
  // ---------------------------------------------------------------------------

  // Centro do mapa baseado nas coordenadas da OS
  const centroMapa: Coordenada = useMemo(() => {
    if (!os) return { lat: -2.5, lng: -44.0 };
    return {
      lat: (toNum(os.ponto_origem_latitude) + toNum(os.ponto_destino_latitude)) / 2,
      lng: (toNum(os.ponto_origem_longitude) + toNum(os.ponto_destino_longitude)) / 2,
    };
  }, [os]);

  // Marcadores de origem/destino (exibidos quando NÃO há resultado)
  const marcadoresOrigemDestino: MarcadorExtra[] = useMemo(() => {
    if (!os) return [];
    return [
      {
        id: 'origem',
        posicao: {
          lat: toNum(os.ponto_origem_latitude),
          lng: toNum(os.ponto_origem_longitude),
        },
        cor: '#22c55e',
        label: 'A',
        titulo: 'Ponto de Origem',
      },
      {
        id: 'destino',
        posicao: {
          lat: toNum(os.ponto_destino_latitude),
          lng: toNum(os.ponto_destino_longitude),
        },
        cor: '#ef4444',
        label: 'B',
        titulo: 'Ponto de Destino',
      },
    ];
  }, [os]);

  // ---------------------------------------------------------------------------
  // Render: Estado Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="visualizar-page loading-state">
        <div className="loading-spinner"></div>
        <p>Carregando OS...</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Erro fatal (sem OS)
  // ---------------------------------------------------------------------------

  if (!os) {
    return (
      <div className="visualizar-page erro-state">
        <div className="erro-icon">❌</div>
        <h2>Erro ao carregar</h2>
        <p>{erro || 'OS não encontrada'}</p>
        <button onClick={() => navigate('/os')}>Voltar</button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Layout unificado (estados pronto, gerando, resultado)
  // ---------------------------------------------------------------------------

  return (
    <div className="visualizar-page">
      {/* ===================================================================
          HEADER — sempre visível
          =================================================================== */}
      <header className="visualizar-header">
        <div className="header-info">
          <button className="btn-voltar" onClick={() => navigate('/os')}>
            ← Voltar
          </button>
          <h1>{os.numero_os}</h1>
          <span className="cliente">
            {os.municipio ? `${os.municipio}/${os.estado}` : os.cliente_nome || ''}
          </span>
        </div>
        <div className="header-acoes">
          {gerando ? (
            <span className="btn-gerando">
              <span className="spinner-sm"></span>
              Gerando...
            </span>
          ) : resultado ? (
            <button className="btn-regerar" onClick={gerarProjeto}>
              🔄 Regerar
            </button>
          ) : (
            <button className="btn-gerar-header" onClick={gerarProjeto}>
              ⚡ Gerar Projeto
            </button>
          )}
        </div>
      </header>

      {/* ===================================================================
          MAPA — sempre visível
          =================================================================== */}
      <div className="area-mapa-principal">
        {GOOGLE_MAPS_API_KEY ? (
          <MapaProjeto
            apiKey={GOOGLE_MAPS_API_KEY}
            centro={centroMapa}
            zoom={15}
            postes={resultado?.postes || []}
            condutores={resultado?.condutores || []}
            barreiras={resultado?.barreiras?.barreiras || []}
            rota={resultado?.perfil?.pontos || []}
            marcadores={resultado ? [] : marcadoresOrigemDestino}
            camadas={camadas}
            onPosteClick={setPosteSelecionado}
          />
        ) : (
          <div className="mapa-placeholder">
            <p>⚠️ API Key do Google Maps não configurada</p>
            <p>
              Adicione <code>REACT_APP_GOOGLE_MAPS_API_KEY</code> no arquivo{' '}
              <code>.env</code>
            </p>
          </div>
        )}
      </div>

      {/* ===================================================================
          BANNER DE ERRO (não-fatal, abaixo do mapa)
          =================================================================== */}
      {erro && (
        <div className="erro-banner">
          <span>❌ {erro}</span>
          <button onClick={() => setErro(null)}>✕</button>
        </div>
      )}

      {/* ===================================================================
          ESTADO "PRONTO" — Painel de configuração
          =================================================================== */}
      {!resultado && !gerando && (
        <div className="config-panel">
          <div className="config-card">
            <h3>⚙️ Configurações do Projeto</h3>

            <div className="config-grid">
              <div className="config-field">
                <label>Tipo de Rede</label>
                <select
                  value={config.tipo_rede}
                  onChange={e => setConfig({ ...config, tipo_rede: e.target.value })}
                >
                  <option value="mt_convencional">MT Convencional</option>
                  <option value="mt_compacta">MT Compacta</option>
                  <option value="bt_multiplexada">BT Multiplexada</option>
                  <option value="bt_convencional">BT Convencional</option>
                </select>
              </div>

              <div className="config-field">
                <label>Natureza</label>
                <select
                  value={config.natureza}
                  onChange={e => setConfig({ ...config, natureza: e.target.value })}
                >
                  <option value="TRIFASICA">Trifásica</option>
                  <option value="BIFASICA">Bifásica</option>
                  <option value="MONOFASICA">Monofásica</option>
                </select>
              </div>

              <div className="config-field">
                <label>Tensão MT (kV)</label>
                <select
                  value={config.tensao_mt}
                  onChange={e =>
                    setConfig({ ...config, tensao_mt: parseFloat(e.target.value) })
                  }
                >
                  <option value={13.8}>13,8 kV</option>
                  <option value={23.1}>23,1 kV</option>
                  <option value={34.5}>34,5 kV</option>
                </select>
              </div>

              <div className="config-field">
                <label>Condutor MT</label>
                <select
                  value={config.condutor_mt}
                  onChange={e => setConfig({ ...config, condutor_mt: e.target.value })}
                >
                  <option value="4 AWG">4 AWG</option>
                  <option value="2 AWG">2 AWG</option>
                  <option value="1/0 AWG">1/0 AWG</option>
                  <option value="4/0 AWG">4/0 AWG</option>
                  <option value="336.4 MCM">336,4 MCM</option>
                </select>
              </div>

              <div className="config-field">
                <label>Tipo de Área</label>
                <select
                  value={config.tipo_area_forcado || ''}
                  onChange={e =>
                    setConfig({
                      ...config,
                      tipo_area_forcado: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Automático (detectar)</option>
                  <option value="URBANA">Urbana</option>
                  <option value="RURAL">Rural</option>
                </select>
              </div>
            </div>

            <div className="config-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={config.com_bt}
                  onChange={e => setConfig({ ...config, com_bt: e.target.checked })}
                />
                Incluir rede BT conjugada
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={config.usar_google_maps}
                  onChange={e =>
                    setConfig({ ...config, usar_google_maps: e.target.checked })
                  }
                />
                Usar Google Maps (barreiras)
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={config.usar_ibge}
                  onChange={e => setConfig({ ...config, usar_ibge: e.target.checked })}
                />
                Consultar IBGE/ANEEL
              </label>
            </div>

            <button className="btn-gerar" onClick={gerarProjeto}>
              ⚡ Gerar Projeto Automático
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================
          ESTADO "GERANDO" — Barra de progresso
          =================================================================== */}
      {gerando && (
        <div className="progress-panel">
          <div className="progress-bar-container">
            <div className="progress-bar-animated"></div>
          </div>
          <p className="progress-text">
            ⚡ Gerando projeto automaticamente... Isso pode levar alguns segundos.
          </p>
          <div className="progress-etapas">
            <span>📡 Consultando APIs</span>
            <span>🗺️ Classificando área</span>
            <span>📐 Posicionando postes</span>
            <span>✅ Validando projeto</span>
          </div>
        </div>
      )}

      {/* ===================================================================
          ESTADO "RESULTADO" — Sidebars + Perfil
          =================================================================== */}
      {resultado && (
        <>
          {/* Resumo rápido */}
          <div className="resultado-resumo-rapido">
            <div className="resumo-item">
              <span className="resumo-valor">{resultado.resumo?.total_postes || resultado.postes?.length || 0}</span>
              <span className="resumo-label">Postes</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-valor">{resultado.resumo?.extensao_mt || 0}m</span>
              <span className="resumo-label">Extensão MT</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-valor">{resultado.resumo?.tipo_area || '-'}</span>
              <span className="resumo-label">Tipo Área</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-valor">{resultado.resumo?.vao_utilizado || '-'}m</span>
              <span className="resumo-label">Vão Médio</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-valor">{resultado.barreiras?.resumo?.total || 0}</span>
              <span className="resumo-label">Barreiras</span>
            </div>
            <div className="resumo-item">
              <span className={`resumo-valor ${resultado.resumo?.erros > 0 ? 'erro' : 'ok'}`}>
                {resultado.resumo?.erros || 0}
              </span>
              <span className="resumo-label">Erros</span>
            </div>
          </div>

          {/* Sidebars */}
          <div className="resultado-layout">
            <aside className="sidebar-esquerda">
              <ControleCamadas
                camadas={camadas}
                onChange={setCamadas}
                contadores={{
                  postes: resultado.postes.length,
                  condutoresMT: resultado.condutores.filter(
                    c => c.tipo_rede === 'MT'
                  ).length,
                  condutoresBT: resultado.condutores.filter(
                    c => c.tipo_rede === 'BT'
                  ).length,
                  barreiras: resultado.barreiras?.barreiras?.length || 0,
                }}
              />
            </aside>

            <aside className="sidebar-direita">
              <PainelResumo
                resumo={resultado.resumo}
                materiais={
                  resultado.materiais?.resumo
                    ? {
                        total_itens: resultado.materiais.resumo.total_itens,
                        peso_total_kg: resultado.materiais.resumo.peso_total_kg || 0,
                        categorias: resultado.materiais.categorias || [],
                      }
                    : undefined
                }
                barreiras={resultado.barreiras?.resumo}
                validacao={resultado.validacao_detalhes}
                onDownloadDXF={downloadDXF}
                onDownloadMateriais={downloadMateriais}
                onSalvarProjeto={salvarProjeto}
                loading={gerando}
              />
            </aside>
          </div>

          {/* Perfil altimétrico */}
          {resultado.perfil && (
            <div className="area-perfil">
              <PerfilAltimetrico perfil={resultado.perfil} altura={200} />
            </div>
          )}

          {/* Validação detalhada */}
          {resultado.validacao_detalhes &&
            (resultado.validacao_detalhes.erros.length > 0 ||
              resultado.validacao_detalhes.avisos.length > 0) && (
              <div className="validacao-panel">
                <h3>📋 Validação do Projeto</h3>
                {resultado.validacao_detalhes.erros.length > 0 && (
                  <div className="validacao-erros">
                    <h4>❌ Erros ({resultado.validacao_detalhes.erros.length})</h4>
                    <ul>
                      {resultado.validacao_detalhes.erros.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {resultado.validacao_detalhes.avisos.length > 0 && (
                  <div className="validacao-avisos">
                    <h4>⚠️ Avisos ({resultado.validacao_detalhes.avisos.length})</h4>
                    <ul>
                      {resultado.validacao_detalhes.avisos.slice(0, 10).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                      {resultado.validacao_detalhes.avisos.length > 10 && (
                        <li className="mais-itens">
                          ... e mais {resultado.validacao_detalhes.avisos.length - 10} avisos
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
        </>
      )}

      {/* Modal de poste selecionado */}
      {posteSelecionado && (
        <div className="modal-poste" onClick={() => setPosteSelecionado(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{posteSelecionado.codigo}</h3>
            <p>Função: {posteSelecionado.funcao}</p>
            <p>Altura: {posteSelecionado.altura}m</p>
            <p>Resistência: {posteSelecionado.resistencia} daN</p>
            <p>Estrutura: {posteSelecionado.estrutura}</p>
            <p>
              Coordenadas: {posteSelecionado.latitude.toFixed(6)},{' '}
              {posteSelecionado.longitude.toFixed(6)}
            </p>
            <button onClick={() => setPosteSelecionado(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualizarProjetoPage;
