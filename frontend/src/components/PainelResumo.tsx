// =============================================================================
// Componente: PainelResumo
// Sidebar com estatísticas e ações do projeto
// =============================================================================

import React from 'react';
import './PainelResumo.css';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface ResumoMateriais {
  total_itens: number;
  peso_total_kg: number;
  categorias: {
    categoria: string;
    quantidade: number;
  }[];
}

interface ResumoBarreiras {
  total: number;
  criticas: number;
  avisos: number;
}

interface ResumoProjeto {
  total_postes: number;
  total_condutores: number;
  extensao_mt: number;
  extensao_bt: number;
  erros: number;
  avisos: number;
  metodo: 'osm' | 'linha_reta';
}

interface ValidacaoDetalhes {
  erros: string[];
  avisos: string[];
}

interface PainelResumoProps {
  resumo: ResumoProjeto;
  materiais?: ResumoMateriais;
  barreiras?: ResumoBarreiras;
  validacao?: ValidacaoDetalhes;
  onDownloadDXF?: () => void;
  onDownloadMateriais?: () => void;
  onSalvarProjeto?: () => void;
  loading?: boolean;
}

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const PainelResumo: React.FC<PainelResumoProps> = ({
  resumo,
  materiais,
  barreiras,
  validacao,
  onDownloadDXF,
  onDownloadMateriais,
  onSalvarProjeto,
  loading = false,
}) => {
  const temErros = resumo.erros > 0;
  const temAvisos = resumo.avisos > 0;

  return (
    <div className={`painel-resumo ${loading ? 'loading' : ''}`}>
      {/* Status do Projeto */}
      <div className={`painel-status ${temErros ? 'erro' : temAvisos ? 'aviso' : 'ok'}`}>
        <div className="status-icon">
          {temErros ? '❌' : temAvisos ? '⚠️' : '✅'}
        </div>
        <div className="status-texto">
          {temErros
            ? `${resumo.erros} erro${resumo.erros > 1 ? 's' : ''} encontrado${resumo.erros > 1 ? 's' : ''}`
            : temAvisos
            ? `${resumo.avisos} aviso${resumo.avisos > 1 ? 's' : ''}`
            : 'Projeto válido'}
        </div>
      </div>

      {/* Seção: Extensão */}
      <div className="painel-secao">
        <h3>📏 Extensão</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-valor grande">{resumo.extensao_mt.toLocaleString()}</span>
            <span className="stat-label">metros MT</span>
          </div>
          <div className="stat-item">
            <span className="stat-valor grande">{resumo.extensao_bt.toLocaleString()}</span>
            <span className="stat-label">metros BT</span>
          </div>
        </div>
      </div>

      {/* Seção: Postes */}
      <div className="painel-secao">
        <h3>🔌 Postes</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <span className="stat-valor grande">{resumo.total_postes}</span>
            <span className="stat-label">postes</span>
          </div>
          <div className="stat-item">
            <span className="stat-valor grande">{resumo.total_condutores}</span>
            <span className="stat-label">trechos</span>
          </div>
        </div>
        <div className="stat-metodo">
          Roteamento: <strong>{resumo.metodo === 'osm' ? 'OpenStreetMap' : 'Linha reta'}</strong>
        </div>
      </div>

      {/* Seção: Barreiras */}
      {barreiras && barreiras.total > 0 && (
        <div className="painel-secao">
          <h3>⚠️ Barreiras</h3>
          <div className="barreiras-lista">
            {barreiras.criticas > 0 && (
              <div className="barreira-item critica">
                <span className="barreira-count">{barreiras.criticas}</span>
                <span className="barreira-label">Críticas</span>
              </div>
            )}
            {barreiras.avisos > 0 && (
              <div className="barreira-item aviso">
                <span className="barreira-count">{barreiras.avisos}</span>
                <span className="barreira-label">Avisos</span>
              </div>
            )}
            <div className="barreira-item info">
              <span className="barreira-count">{barreiras.total}</span>
              <span className="barreira-label">Total</span>
            </div>
          </div>
        </div>
      )}

      {/* Seção: Materiais */}
      {materiais && (
        <div className="painel-secao">
          <h3>📦 Materiais</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-valor grande">{materiais.total_itens}</span>
              <span className="stat-label">itens</span>
            </div>
            <div className="stat-item">
              <span className="stat-valor">{materiais.peso_total_kg.toLocaleString()}</span>
              <span className="stat-label">kg total</span>
            </div>
          </div>
        </div>
      )}

      {/* Seção: Erros/Avisos Detalhados */}
      {validacao && (validacao.erros.length > 0 || validacao.avisos.length > 0) && (
        <div className="painel-secao validacao-detalhes">
          <h3>📋 Validação</h3>
          
          {validacao.erros.length > 0 && (
            <div className="validacao-lista erros">
              <h4>Erros ({validacao.erros.length})</h4>
              <ul>
                {validacao.erros.slice(0, 5).map((erro, i) => (
                  <li key={i}>{erro}</li>
                ))}
                {validacao.erros.length > 5 && (
                  <li className="mais">... e mais {validacao.erros.length - 5}</li>
                )}
              </ul>
            </div>
          )}

          {validacao.avisos.length > 0 && (
            <div className="validacao-lista avisos">
              <h4>Avisos ({validacao.avisos.length})</h4>
              <ul>
                {validacao.avisos.slice(0, 5).map((aviso, i) => (
                  <li key={i}>{aviso}</li>
                ))}
                {validacao.avisos.length > 5 && (
                  <li className="mais">... e mais {validacao.avisos.length - 5}</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="painel-acoes">
        <button
          className="btn-acao primary"
          onClick={onDownloadDXF}
          disabled={loading}
        >
          📐 Baixar DXF
        </button>
        
        <button
          className="btn-acao secondary"
          onClick={onDownloadMateriais}
          disabled={loading}
        >
          📋 Lista de Materiais
        </button>

        <button
          className="btn-acao success"
          onClick={onSalvarProjeto}
          disabled={loading || temErros}
        >
          💾 Salvar Projeto
        </button>
      </div>
    </div>
  );
};

export default PainelResumo;
