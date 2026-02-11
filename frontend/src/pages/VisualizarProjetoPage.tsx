// =============================================================================
// Página: VisualizarProjetoPage
// Visualização completa do projeto com mapa, perfil e painel
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MapaProjeto, { 
  PosteGerado, 
  CondutorGerado, 
  Barreira, 
  CamadasVisiveis,
  Coordenada 
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
  cliente_nome: string;
  ponto_origem_latitude: number;
  ponto_origem_longitude: number;
  ponto_destino_latitude: number;
  ponto_destino_longitude: number;
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
    resumo: { total_itens: number; peso_total_kg: number };
    categorias: { categoria: string; quantidade: number }[];
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
  };
  validacao_detalhes?: {
    erros: string[];
    avisos: string[];
  };
}

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

// TODO: Mover para variável de ambiente
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const VisualizarProjetoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const osId = parseInt(id || '0', 10);

  // Estado
  const [os, setOS] = useState<OS | null>(null);
  const [resultado, setResultado] = useState<ResultadoGeracao | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [posteSelecionado, setPosteSelecionado] = useState<PosteGerado | null>(null);
  
  const [camadas, setCamadas] = useState<CamadasVisiveis>({
    postes: true,
    condutoresMT: true,
    condutoresBT: true,
    barreiras: true,
    terreno: false,
    rota: true,
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
        setOS(data?.data || data);
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
  // Gerar projeto
  // ---------------------------------------------------------------------------

  const gerarProjeto = useCallback(async () => {
    if (!osId) return;

    setGerando(true);
    setErro(null);

    try {
      const response = await fetch(`${API_BASE_URL}/os/${osId}/gerar-projeto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
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
  }, [osId]);

  // ---------------------------------------------------------------------------
  // Ações
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
    // TODO: Implementar exportação de materiais (CSV/Excel)
    alert('Funcionalidade em desenvolvimento');
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
  // Calcular centro do mapa
  // ---------------------------------------------------------------------------

  const centroMapa: Coordenada = os
    ? {
        lat: (parseFloat(String(os.ponto_origem_latitude)) + parseFloat(String(os.ponto_destino_latitude))) / 2,
        lng: (parseFloat(String(os.ponto_origem_longitude)) + parseFloat(String(os.ponto_destino_longitude))) / 2,
      }
    : { lat: -2.5, lng: -44.0 };

  // ---------------------------------------------------------------------------
  // Render: Loading
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
  // Render: Erro
  // ---------------------------------------------------------------------------

  if (erro && !resultado) {
    return (
      <div className="visualizar-page erro-state">
        <div className="erro-icon">❌</div>
        <h2>Erro ao carregar</h2>
        <p>{erro}</p>
        <button onClick={() => navigate('/os')}>Voltar</button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Sem projeto gerado
  // ---------------------------------------------------------------------------

  if (!resultado) {
    return (
      <div className="visualizar-page inicial-state">
        <div className="inicial-card">
          <h1>📐 Gerar Projeto</h1>
          <div className="os-info">
            <p><strong>OS:</strong> {os?.numero_os}</p>
            <p><strong>Cliente:</strong> {os?.cliente_nome}</p>
          </div>
          
          <button 
            className="btn-gerar" 
            onClick={gerarProjeto}
            disabled={gerando}
          >
            {gerando ? (
              <>
                <span className="spinner"></span>
                Gerando projeto...
              </>
            ) : (
              <>⚡ Gerar Projeto Automático</>
            )}
          </button>

          {erro && <p className="erro-msg">{erro}</p>}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Projeto gerado
  // ---------------------------------------------------------------------------

  return (
    <div className="visualizar-page">
      {/* Header */}
      <header className="visualizar-header">
        <div className="header-info">
          <button className="btn-voltar" onClick={() => navigate('/os')}>
            ← Voltar
          </button>
          <h1>{os?.numero_os}</h1>
          <span className="cliente">{os?.cliente_nome}</span>
        </div>
        <div className="header-acoes">
          <button className="btn-regerar" onClick={gerarProjeto} disabled={gerando}>
            🔄 Regerar
          </button>
        </div>
      </header>

      {/* Layout principal */}
      <div className="visualizar-layout">
        {/* Sidebar esquerda - Controles */}
        <aside className="sidebar-esquerda">
          <ControleCamadas
            camadas={camadas}
            onChange={setCamadas}
            contadores={{
              postes: resultado.postes.length,
              condutoresMT: resultado.condutores.filter(c => c.tipo_rede === 'MT').length,
              condutoresBT: resultado.condutores.filter(c => c.tipo_rede === 'BT').length,
              barreiras: resultado.barreiras?.barreiras?.length || 0,
            }}
          />
        </aside>

        {/* Área central - Mapa */}
        <main className="area-mapa">
          {GOOGLE_MAPS_API_KEY ? (
            <MapaProjeto
              apiKey={GOOGLE_MAPS_API_KEY}
              centro={centroMapa}
              zoom={15}
              postes={resultado.postes}
              condutores={resultado.condutores}
              barreiras={resultado.barreiras?.barreiras || []}
              rota={resultado.perfil?.pontos || []}
              camadas={camadas}
              onPosteClick={setPosteSelecionado}
            />
          ) : (
            <div className="mapa-placeholder">
              <p>⚠️ API Key do Google Maps não configurada</p>
              <p>Adicione <code>REACT_APP_GOOGLE_MAPS_API_KEY</code> no arquivo <code>.env</code></p>
            </div>
          )}
        </main>

        {/* Sidebar direita - Resumo */}
        <aside className="sidebar-direita">
          <PainelResumo
            resumo={resultado.resumo}
            materiais={resultado.materiais?.resumo ? {
              total_itens: resultado.materiais.resumo.total_itens,
              peso_total_kg: resultado.materiais.resumo.peso_total_kg || 0,
              categorias: resultado.materiais.categorias || [],
            } : undefined}
            barreiras={resultado.barreiras?.resumo}
            validacao={resultado.validacao_detalhes}
            onDownloadDXF={downloadDXF}
            onDownloadMateriais={downloadMateriais}
            onSalvarProjeto={salvarProjeto}
            loading={gerando}
          />
        </aside>
      </div>

      {/* Área inferior - Perfil altimétrico */}
      <div className="area-perfil">
        <PerfilAltimetrico
          perfil={resultado.perfil}
          altura={200}
        />
      </div>

      {/* Modal de poste selecionado (opcional) */}
      {posteSelecionado && (
        <div className="modal-poste" onClick={() => setPosteSelecionado(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{posteSelecionado.codigo}</h3>
            <p>Função: {posteSelecionado.funcao}</p>
            <p>Altura: {posteSelecionado.altura}m</p>
            <p>Resistência: {posteSelecionado.resistencia} daN</p>
            <button onClick={() => setPosteSelecionado(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VisualizarProjetoPage;
