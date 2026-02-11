// =============================================================================
// Componente: ControleCamadas
// Toggle para ligar/desligar camadas do mapa
// =============================================================================

import React from 'react';
import './ControleCamadas.css';
import type { CamadasVisiveis } from './MapaProjeto';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface ControleCamadasProps {
  camadas: CamadasVisiveis;
  onChange: (camadas: CamadasVisiveis) => void;
  contadores?: {
    postes?: number;
    condutoresMT?: number;
    condutoresBT?: number;
    barreiras?: number;
  };
}

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const ControleCamadas: React.FC<ControleCamadasProps> = ({
  camadas,
  onChange,
  contadores = {},
}) => {
  const toggleCamada = (key: keyof CamadasVisiveis) => {
    onChange({
      ...camadas,
      [key]: !camadas[key],
    });
  };

  const CamadaItem = ({
    id,
    label,
    cor,
    icone,
    contador,
  }: {
    id: keyof CamadasVisiveis;
    label: string;
    cor: string;
    icone?: string;
    contador?: number;
  }) => (
    <label className={`camada-item ${camadas[id] ? 'ativo' : ''}`}>
      <input
        type="checkbox"
        checked={camadas[id]}
        onChange={() => toggleCamada(id)}
      />
      <span className="camada-check" style={{ borderColor: cor }}>
        {camadas[id] && (
          <span className="check-mark" style={{ background: cor }}></span>
        )}
      </span>
      <span className="camada-icone">{icone}</span>
      <span className="camada-label">{label}</span>
      {contador !== undefined && contador > 0 && (
        <span className="camada-contador">{contador}</span>
      )}
    </label>
  );

  return (
    <div className="controle-camadas">
      <h4>Camadas</h4>
      
      <div className="camadas-grupo">
        <span className="grupo-titulo">Elementos</span>
        
        <CamadaItem
          id="postes"
          label="Postes"
          cor="#22c55e"
          icone="●"
          contador={contadores.postes}
        />
        
        <CamadaItem
          id="condutoresMT"
          label="Rede MT"
          cor="#dc2626"
          icone="—"
          contador={contadores.condutoresMT}
        />
        
        <CamadaItem
          id="condutoresBT"
          label="Rede BT"
          cor="#2563eb"
          icone="—"
          contador={contadores.condutoresBT}
        />
      </div>

      <div className="camadas-grupo">
        <span className="grupo-titulo">Análise</span>
        
        <CamadaItem
          id="barreiras"
          label="Barreiras"
          cor="#f59e0b"
          icone="⚠️"
          contador={contadores.barreiras}
        />
        
        <CamadaItem
          id="rota"
          label="Rota OSM"
          cor="#94a3b8"
          icone="┄"
        />
        
        <CamadaItem
          id="terreno"
          label="Terreno"
          cor="#84cc16"
          icone="▨"
        />
      </div>

      <div className="camadas-acoes">
        <button
          className="btn-camadas"
          onClick={() =>
            onChange({
              postes: true,
              condutoresMT: true,
              condutoresBT: true,
              barreiras: true,
              terreno: true,
              rota: true,
            })
          }
        >
          Mostrar todas
        </button>
        <button
          className="btn-camadas"
          onClick={() =>
            onChange({
              postes: false,
              condutoresMT: false,
              condutoresBT: false,
              barreiras: false,
              terreno: false,
              rota: false,
            })
          }
        >
          Ocultar todas
        </button>
      </div>
    </div>
  );
};

export default ControleCamadas;
