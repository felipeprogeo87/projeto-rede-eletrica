// =============================================================================
// Página: Geração de Projeto Completa
// =============================================================================

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MonitorGeracao from '../components/MonitorGeracao';
import ListaErros from '../components/ListaErros';

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

interface OS {
  id: number;
  numero_os: string;
  ponto_origem_latitude: number | string;
  ponto_origem_longitude: number | string;
  ponto_destino_latitude: number | string;
  ponto_destino_longitude: number | string;
  tipo_projeto?: string;
  tipo_rede?: string;
  status?: string;
  municipio?: string;
  estado?: string;
}

interface Erro {
  id: string;
  tipo: 'ERRO' | 'AVISO' | 'INFO';
  categoria: string;
  mensagem: string;
  detalhe?: string;
  localizacao?: { lat: number; lng: number; posteId?: string };
  sugestao?: string;
  regra?: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const GerarProjetoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const osId = parseInt(id || '0', 10);

  const [os, setOS] = useState<OS | null>(null);
  const [loading, setLoading] = useState(true);
  const [etapa, setEtapa] = useState<'config' | 'gerando' | 'resultado'>('config');
  const [resultado, setResultado] = useState<any>(null);
  const [erros, setErros] = useState<Erro[]>([]);
  const [config, setConfig] = useState<ConfigGeracao>({
    tipo_rede: 'mt_convencional',
    natureza: 'TRIFASICA',
    tensao_mt: 13.8,
    condutor_mt: '1/0 AWG',
    com_bt: true,
    usar_google_maps: false,
    usar_ibge: false,
  });

  // Helper para converter coordenadas
  const toNumber = (val: number | string): number => {
    return typeof val === 'string' ? parseFloat(val) : val;
  };

  // Carregar dados da OS
  useEffect(() => {
    const carregarOS = async () => {
      try {
        const response = await fetch(`${API_URL}/os/${osId}`);
        if (response.ok) {
          const data = await response.json();
          setOS(data);
          
          // Pré-configurar baseado na OS
          if (data.tipo_rede) {
            setConfig(prev => ({ ...prev, tipo_rede: data.tipo_rede }));
          }
        }
      } catch (error) {
        console.error('Erro ao carregar OS:', error);
      } finally {
        setLoading(false);
      }
    };

    if (osId > 0) {
      carregarOS();
    }
  }, [osId]);

  // Callback quando geração completa
  const onGeracaoCompleta = (res: any) => {
    setResultado(res);
    
    // Extrair erros e avisos
    const todosErros: Erro[] = [];
    if (res.validacao_detalhes?.erros) {
      todosErros.push(...res.validacao_detalhes.erros);
    }
    if (res.validacao_detalhes?.avisos) {
      todosErros.push(...res.validacao_detalhes.avisos);
    }
    setErros(todosErros);
    
    setEtapa('resultado');
  };

  // Callback de erro
  const onGeracaoErro = (erro: string) => {
    console.error('Erro na geração:', erro);
    setErros([{
      id: 'ERR_GERAL',
      tipo: 'ERRO',
      categoria: 'SISTEMA',
      mensagem: erro,
    }]);
  };

  // Localizar no mapa - abre página de visualização com coordenadas
  const localizarNoMapa = (lat: number, lng: number) => {
    // Redirecionar para a visualização completa para ver no mapa
    if (osId) {
      window.open(`/os/${osId}/visualizar?lat=${lat}&lng=${lng}`, '_blank');
    }
  };

  // Download DXF
  const downloadDXF = () => {
    if (!resultado?.dxf) return;
    const blob = new Blob([resultado.dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `projeto_${os?.numero_os || osId}.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download materiais CSV
  const downloadMateriais = () => {
    if (!resultado?.materiais?.itens) return;
    const headers = 'Código;Descrição;Unidade;Quantidade;Categoria\n';
    const rows = resultado.materiais.itens.map((item: any) =>
      `${item.codigo};${item.descricao};${item.unidade};${item.quantidade};${item.categoria}`
    ).join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `materiais_${os?.numero_os || osId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (!os) {
    return (
      <div style={styles.container}>
        <p>OS não encontrada.</p>
        <button onClick={() => navigate('/os')} style={styles.btnVoltar}>
          ← Voltar
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => navigate('/os')} style={styles.btnVoltar}>
          ← Voltar
        </button>
        <h1 style={styles.titulo}>
          {etapa === 'config' && '⚙️ Configurar Geração'}
          {etapa === 'gerando' && '🔄 Gerando Projeto...'}
          {etapa === 'resultado' && '✅ Projeto Gerado'}
        </h1>
        <span style={styles.osInfo}>{os.numero_os}</span>
      </div>

      {/* ======================= ETAPA: CONFIGURAÇÃO ======================= */}
      {etapa === 'config' && (
        <div style={styles.configContainer}>
          {/* Info da OS */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📋 Ordem de Serviço</h3>
            <div style={styles.osDetails}>
              <p><strong>Número:</strong> {os.numero_os}</p>
              <p><strong>Município:</strong> {os.municipio || '-'} / {os.estado || '-'}</p>
              <p><strong>Origem:</strong> {toNumber(os.ponto_origem_latitude).toFixed(6)}, {toNumber(os.ponto_origem_longitude).toFixed(6)}</p>
              <p><strong>Destino:</strong> {toNumber(os.ponto_destino_latitude).toFixed(6)}, {toNumber(os.ponto_destino_longitude).toFixed(6)}</p>
            </div>
          </div>

          {/* Configurações */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>⚙️ Configurações do Projeto</h3>
            
            <div style={styles.formGrid}>
              {/* Tipo de Rede */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tipo de Rede</label>
                <select
                  value={config.tipo_rede}
                  onChange={(e) => setConfig({ ...config, tipo_rede: e.target.value })}
                  style={styles.select}
                >
                  <option value="mt_convencional">MT Convencional</option>
                  <option value="mt_compacta">MT Compacta</option>
                  <option value="bt_multiplexada">BT Multiplexada</option>
                  <option value="bt_convencional">BT Convencional</option>
                </select>
              </div>

              {/* Natureza */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Natureza</label>
                <select
                  value={config.natureza}
                  onChange={(e) => setConfig({ ...config, natureza: e.target.value })}
                  style={styles.select}
                >
                  <option value="TRIFASICA">Trifásica</option>
                  <option value="BIFASICA">Bifásica</option>
                  <option value="MONOFASICA">Monofásica</option>
                </select>
              </div>

              {/* Tensão MT */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tensão MT (kV)</label>
                <select
                  value={config.tensao_mt}
                  onChange={(e) => setConfig({ ...config, tensao_mt: parseFloat(e.target.value) })}
                  style={styles.select}
                >
                  <option value={13.8}>13,8 kV</option>
                  <option value={23.1}>23,1 kV</option>
                  <option value={34.5}>34,5 kV</option>
                </select>
              </div>

              {/* Condutor MT */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Condutor MT</label>
                <select
                  value={config.condutor_mt}
                  onChange={(e) => setConfig({ ...config, condutor_mt: e.target.value })}
                  style={styles.select}
                >
                  <option value="4 AWG">4 AWG</option>
                  <option value="2 AWG">2 AWG</option>
                  <option value="1/0 AWG">1/0 AWG</option>
                  <option value="4/0 AWG">4/0 AWG</option>
                  <option value="336.4 MCM">336,4 MCM</option>
                </select>
              </div>

              {/* Tipo de Área */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tipo de Área</label>
                <select
                  value={config.tipo_area_forcado || ''}
                  onChange={(e) => setConfig({ ...config, tipo_area_forcado: e.target.value || undefined })}
                  style={styles.select}
                >
                  <option value="">Automático (detectar)</option>
                  <option value="URBANA">Urbana</option>
                  <option value="RURAL">Rural</option>
                </select>
              </div>
            </div>

            {/* Checkboxes */}
            <div style={styles.checkboxGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.com_bt}
                  onChange={(e) => setConfig({ ...config, com_bt: e.target.checked })}
                />
                Incluir rede BT conjugada
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.usar_google_maps}
                  onChange={(e) => setConfig({ ...config, usar_google_maps: e.target.checked })}
                />
                Usar Google Maps (barreiras)
              </label>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.usar_ibge}
                  onChange={(e) => setConfig({ ...config, usar_ibge: e.target.checked })}
                />
                Consultar IBGE/ANEEL
              </label>
            </div>
          </div>

          {/* Botão Gerar */}
          <button onClick={() => setEtapa('gerando')} style={styles.btnGerar}>
            ⚡ Iniciar Geração do Projeto
          </button>
        </div>
      )}

      {/* ======================= ETAPA: GERANDO ======================= */}
      {etapa === 'gerando' && (
        <MonitorGeracao
          osId={osId}
          onComplete={onGeracaoCompleta}
          onError={onGeracaoErro}
        />
      )}

      {/* ======================= ETAPA: RESULTADO ======================= */}
      {etapa === 'resultado' && resultado && (
        <div style={styles.resultadoContainer}>
          {/* Resumo */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📊 Resumo do Projeto</h3>
            <div style={styles.resumoGrid}>
              <div style={styles.resumoItem}>
                <span style={styles.resumoValor}>{resultado.resumo?.total_postes || resultado.postes?.length || 0}</span>
                <span style={styles.resumoLabel}>Postes</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoValor}>{resultado.resumo?.extensao_mt || 0}m</span>
                <span style={styles.resumoLabel}>Extensão MT</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoValor}>{resultado.resumo?.tipo_area || resultado.classificacao_area?.tipo || '-'}</span>
                <span style={styles.resumoLabel}>Tipo Área</span>
              </div>
              <div style={styles.resumoItem}>
                <span style={styles.resumoValor}>{resultado.resumo?.vao_utilizado || '-'}m</span>
                <span style={styles.resumoLabel}>Vão Médio</span>
              </div>
            </div>

            {/* Estatísticas adicionais */}
            {(resultado.resumo?.esquinas_utilizadas > 0 || resultado.resumo?.travessias_detectadas > 0) && (
              <div style={styles.estatisticas}>
                <p>🔀 Esquinas: {resultado.resumo?.esquinas_utilizadas || 0}</p>
                <p>🚧 Travessias: {resultado.resumo?.travessias_detectadas || 0}</p>
                <p>⚠️ Barreiras: {resultado.barreiras?.resumo?.total || 0}</p>
              </div>
            )}
          </div>

          {/* Botões de Download */}
          <div style={styles.downloadButtons}>
            <button onClick={downloadDXF} style={styles.btnDownload}>
              📐 Baixar DXF
            </button>
            <button onClick={downloadMateriais} style={styles.btnDownload}>
              📋 Baixar Materiais (CSV)
            </button>
            <button onClick={() => setEtapa('config')} style={styles.btnSecondary}>
              🔄 Gerar Novamente
            </button>
          </div>

          {/* Lista de Erros/Avisos */}
          {erros.length > 0 && (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>⚠️ Validação do Projeto</h3>
              <ListaErros
                erros={erros.filter(e => e.tipo === 'ERRO')}
                avisos={erros.filter(e => e.tipo === 'AVISO' || e.tipo === 'INFO')}
                onLocalizarNoMapa={localizarNoMapa}
              />
            </div>
          )}

          {/* Materiais */}
          {resultado.materiais?.itens && (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>🔧 Lista de Materiais ({resultado.materiais.itens.length} itens)</h3>
              <div style={styles.materiaisResumo}>
                <p>📍 Postes: {resultado.materiais.resumo?.total_postes || 0}</p>
                <p>🔌 MT: {resultado.materiais.resumo?.total_metros_mt || 0}m</p>
                <p>🔌 BT: {resultado.materiais.resumo?.total_metros_bt || 0}m</p>
              </div>
              <table style={styles.tabela}>
                <thead>
                  <tr>
                    <th style={styles.th}>Código</th>
                    <th style={styles.th}>Descrição</th>
                    <th style={styles.th}>Qtd</th>
                    <th style={styles.th}>Un</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.materiais.itens.slice(0, 10).map((item: any, idx: number) => (
                    <tr key={idx}>
                      <td style={styles.td}>{item.codigo}</td>
                      <td style={styles.td}>{item.descricao}</td>
                      <td style={styles.td}>{item.quantidade}</td>
                      <td style={styles.td}>{item.unidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultado.materiais.itens.length > 10 && (
                <p style={styles.maisItens}>
                  ... e mais {resultado.materiais.itens.length - 10} itens
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Estilos
// =============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  },
  btnVoltar: {
    padding: '8px 16px',
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  titulo: {
    flex: 1,
    fontSize: '24px',
    fontWeight: '600',
    color: '#1e293b',
    margin: 0,
  },
  osInfo: {
    padding: '8px 16px',
    background: '#3b82f6',
    color: 'white',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
  },
  configContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 0,
    marginBottom: '16px',
  },
  osDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    fontSize: '14px',
    color: '#475569',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    backgroundColor: 'white',
  },
  checkboxGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#475569',
    cursor: 'pointer',
  },
  btnGerar: {
    padding: '16px 32px',
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    alignSelf: 'center',
    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
  },
  resultadoContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  resumoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
  resumoItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '8px',
  },
  resumoValor: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#3b82f6',
  },
  resumoLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '4px',
  },
  estatisticas: {
    display: 'flex',
    gap: '24px',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #e2e8f0',
    fontSize: '14px',
    color: '#475569',
  },
  downloadButtons: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
  },
  btnDownload: {
    padding: '12px 24px',
    background: '#22c55e',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '12px 24px',
    background: 'white',
    color: '#3b82f6',
    border: '1px solid #3b82f6',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  materiaisResumo: {
    display: 'flex',
    gap: '24px',
    marginBottom: '16px',
    fontSize: '14px',
    color: '#475569',
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '10px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    fontWeight: '600',
    color: '#64748b',
  },
  td: {
    padding: '10px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
  },
  maisItens: {
    marginTop: '12px',
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic',
  },
};

export default GerarProjetoPage;
