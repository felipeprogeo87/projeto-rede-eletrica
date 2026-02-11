// =============================================================================
// Componente: PerfilAltimetrico
// Gráfico de elevação do terreno com postes marcados
// =============================================================================

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import './PerfilAltimetrico.css';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

interface PontoElevacao {
  lat: number;
  lng: number;
  elevacao: number;
}

interface PerfilData {
  pontos: PontoElevacao[];
  elevacaoMinima: number;
  elevacaoMaxima: number;
  desnivelTotal: number;
  decliveMaximo: number;
}

interface PostePerfil {
  codigo: string;
  distancia: number;  // distância acumulada em metros
  elevacao: number;
}

interface PerfilAltimetricoProps {
  perfil: PerfilData;
  postes?: PostePerfil[];
  altura?: number;
}

// -----------------------------------------------------------------------------
// Utilitários
// -----------------------------------------------------------------------------

function calcularDistancia(p1: PontoElevacao, p2: PontoElevacao): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const PerfilAltimetrico: React.FC<PerfilAltimetricoProps> = ({
  perfil,
  postes = [],
  altura = 250,
}) => {
  // Processar dados para o gráfico
  const dadosGrafico = useMemo(() => {
    if (!perfil.pontos || perfil.pontos.length === 0) return [];

    let distanciaAcumulada = 0;
    return perfil.pontos.map((ponto, index) => {
      if (index > 0) {
        distanciaAcumulada += calcularDistancia(perfil.pontos[index - 1], ponto);
      }
      return {
        distancia: Math.round(distanciaAcumulada),
        elevacao: ponto.elevacao,
        label: `${Math.round(distanciaAcumulada)}m`,
      };
    });
  }, [perfil.pontos]);

  // Calcular domínio Y com margem
  const dominioY = useMemo(() => {
    const min = Math.floor(perfil.elevacaoMinima - 5);
    const max = Math.ceil(perfil.elevacaoMaxima + 5);
    return [min, max];
  }, [perfil.elevacaoMinima, perfil.elevacaoMaxima]);

  // Distância total
  const distanciaTotal = dadosGrafico.length > 0 
    ? dadosGrafico[dadosGrafico.length - 1].distancia 
    : 0;

  // Tooltip customizado
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="perfil-tooltip">
          <p className="distancia">{label}m</p>
          <p className="elevacao">
            <span className="valor">{payload[0].value.toFixed(1)}</span>
            <span className="unidade">m alt.</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (dadosGrafico.length === 0) {
    return (
      <div className="perfil-container perfil-vazio">
        <p>Sem dados de elevação disponíveis</p>
      </div>
    );
  }

  return (
    <div className="perfil-container">
      {/* Header com estatísticas */}
      <div className="perfil-header">
        <h3>📊 Perfil Altimétrico</h3>
        <div className="perfil-stats">
          <div className="stat">
            <span className="stat-label">Extensão</span>
            <span className="stat-valor">{distanciaTotal.toLocaleString()}m</span>
          </div>
          <div className="stat">
            <span className="stat-label">Mín.</span>
            <span className="stat-valor">{perfil.elevacaoMinima.toFixed(0)}m</span>
          </div>
          <div className="stat">
            <span className="stat-label">Máx.</span>
            <span className="stat-valor">{perfil.elevacaoMaxima.toFixed(0)}m</span>
          </div>
          <div className="stat">
            <span className="stat-label">Desnível</span>
            <span className="stat-valor">{perfil.desnivelTotal.toFixed(1)}m</span>
          </div>
          <div className="stat">
            <span className="stat-label">Declive máx.</span>
            <span className={`stat-valor ${perfil.decliveMaximo > 15 ? 'alerta' : ''}`}>
              {perfil.decliveMaximo.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="perfil-grafico" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={dadosGrafico}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            {/* Gradiente de preenchimento */}
            <defs>
              <linearGradient id="gradienteElevacao" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            
            <XAxis
              dataKey="distancia"
              tickFormatter={(v) => `${v}m`}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            
            <YAxis
              domain={dominioY}
              tickFormatter={(v) => `${v}m`}
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              width={50}
            />
            
            <Tooltip content={<CustomTooltip />} />

            {/* Área do perfil */}
            <Area
              type="monotone"
              dataKey="elevacao"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#gradienteElevacao)"
              animationDuration={1000}
            />

            {/* Linha de referência - elevação média */}
            <ReferenceLine
              y={(perfil.elevacaoMinima + perfil.elevacaoMaxima) / 2}
              stroke="#94a3b8"
              strokeDasharray="5 5"
              label={{
                value: 'Média',
                position: 'right',
                fill: '#94a3b8',
                fontSize: 10,
              }}
            />

            {/* Marcadores de postes */}
            {postes.map((poste, index) => (
              <ReferenceDot
                key={poste.codigo}
                x={poste.distancia}
                y={poste.elevacao}
                r={5}
                fill="#22c55e"
                stroke="#ffffff"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda de postes (se houver) */}
      {postes.length > 0 && (
        <div className="perfil-legenda-postes">
          <span className="legenda-dot"></span>
          <span>Postes ({postes.length})</span>
        </div>
      )}
    </div>
  );
};

export default PerfilAltimetrico;
