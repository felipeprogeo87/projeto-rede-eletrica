// =============================================================================
// Componente: MapaProjeto
// Mapa Google Maps com visualização de projeto elétrico
// =============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import './MapaProjeto.css';

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface PosteGerado {
  id: string;
  codigo: string;
  latitude: number;
  longitude: number;
  altura: number;
  resistencia: number;
  estrutura: string;
  tipo: 'novo' | 'existente';
  funcao: 'TANGENTE' | 'ANGULO' | 'DERIVACAO' | 'FIM' | 'ANCORAGEM' | 'EQUIPAMENTO';
  trafo_kva?: number;
  chave_fusivel?: boolean;
  para_raios?: boolean;
  estai?: boolean;
  aterramento?: boolean;
}

export interface CondutorGerado {
  id: string;
  poste_origem_id: string;
  poste_destino_id: string;
  tipo_rede: 'MT' | 'BT';
  tipo_cabo: string;
  comprimento_metros: number;
}

export interface Barreira {
  id: string;
  tipo: 'TRAVESSIA_HIDRICA' | 'TRAVESSIA_RODOVIARIA' | 'TRAVESSIA_FERROVIARIA' | 
        'VEGETACAO' | 'AREA_ALAGAVEL' | 'EDIFICACAO' | 'LT_CRUZAMENTO';
  latitude: number;
  longitude: number;
  descricao: string;
  severidade: 'CRITICA' | 'AVISO' | 'INFO';
  poste_proximo_id?: string;
}

export interface CamadasVisiveis {
  postes: boolean;
  condutoresMT: boolean;
  condutoresBT: boolean;
  barreiras: boolean;
  terreno: boolean;
  rota: boolean;
}

export interface MarcadorExtra {
  id: string;
  posicao: Coordenada;
  cor: string;
  label?: string;
  titulo?: string;
}

interface MapaProjetoProps {
  centro: Coordenada;
  zoom?: number;
  postes?: PosteGerado[];
  condutores?: CondutorGerado[];
  barreiras?: Barreira[];
  rota?: Coordenada[];
  marcadores?: MarcadorExtra[];
  onPosteClick?: (poste: PosteGerado) => void;
  onBarreiraClick?: (barreira: Barreira) => void;
  camadas?: CamadasVisiveis;
  apiKey: string;
}

// -----------------------------------------------------------------------------
// Cores por função de poste
// -----------------------------------------------------------------------------

const CORES_POSTE: Record<string, string> = {
  TANGENTE: '#22c55e',     // Verde
  ANGULO: '#eab308',       // Amarelo
  FIM: '#ef4444',          // Vermelho
  ANCORAGEM: '#f97316',    // Laranja
  DERIVACAO: '#3b82f6',    // Azul
  EQUIPAMENTO: '#a855f7',  // Roxo
};

const CORES_BARREIRA: Record<string, string> = {
  TRAVESSIA_HIDRICA: '#0ea5e9',
  TRAVESSIA_RODOVIARIA: '#64748b',
  TRAVESSIA_FERROVIARIA: '#1e293b',
  VEGETACAO: '#16a34a',
  AREA_ALAGAVEL: '#06b6d4',
  EDIFICACAO: '#78716c',
  LT_CRUZAMENTO: '#fbbf24',
};

const ICONES_BARREIRA: Record<string, string> = {
  TRAVESSIA_HIDRICA: '🌊',
  TRAVESSIA_RODOVIARIA: '🛣️',
  TRAVESSIA_FERROVIARIA: '🚂',
  VEGETACAO: '🌳',
  AREA_ALAGAVEL: '💧',
  EDIFICACAO: '🏠',
  LT_CRUZAMENTO: '⚡',
};

// -----------------------------------------------------------------------------
// Componente Principal
// -----------------------------------------------------------------------------

const MapaProjeto: React.FC<MapaProjetoProps> = ({
  centro,
  zoom = 16,
  postes = [],
  condutores = [],
  barreiras = [],
  rota = [],
  marcadores = [],
  onPosteClick,
  onBarreiraClick,
  camadas = {
    postes: true,
    condutoresMT: true,
    condutoresBT: true,
    barreiras: true,
    terreno: false,
    rota: true,
  },
  apiKey,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<'satellite' | 'roadmap' | 'hybrid'>('hybrid');
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // ---------------------------------------------------------------------------
  // Carregar Google Maps API
  // ---------------------------------------------------------------------------
  
  useEffect(() => {
    if (window.google?.maps) {
      initMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    document.head.appendChild(script);

    return () => {
      // Cleanup
      markersRef.current.forEach(m => m.setMap(null));
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // ---------------------------------------------------------------------------
  // Inicializar Mapa
  // ---------------------------------------------------------------------------

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google?.maps) return;

    const mapInstance = new google.maps.Map(mapRef.current, {
      center: { lat: centro.lat, lng: centro.lng },
      zoom: zoom,
      mapTypeId: mapType,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
    });

    infoWindowRef.current = new google.maps.InfoWindow();
    setMap(mapInstance);
  }, [centro, zoom, mapType]);

  // ---------------------------------------------------------------------------
  // Atualizar tipo de mapa
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (map) {
      map.setMapTypeId(mapType);
    }
  }, [map, mapType]);

  // ---------------------------------------------------------------------------
  // Desenhar elementos no mapa
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!map) return;

    // Limpar elementos anteriores
    markersRef.current.forEach(m => m.setMap(null));
    polylinesRef.current.forEach(p => p.setMap(null));
    markersRef.current = [];
    polylinesRef.current = [];

    // Mapa de postes por ID para lookup rápido
    const postesMap = new Map(postes.map(p => [p.id, p]));

    // ---------------------------------------------------------------------------
    // Desenhar rota (linha tracejada cinza)
    // ---------------------------------------------------------------------------
    
    if (camadas.rota && rota.length > 1) {
      const rotaPath = new google.maps.Polyline({
        path: rota.map(c => ({ lat: c.lat, lng: c.lng })),
        geodesic: true,
        strokeColor: '#94a3b8',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        icons: [{
          icon: {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 3,
          },
          offset: '0',
          repeat: '15px',
        }],
      });
      rotaPath.setMap(map);
      polylinesRef.current.push(rotaPath);
    }

    // ---------------------------------------------------------------------------
    // Desenhar condutores MT (vermelho)
    // ---------------------------------------------------------------------------
    
    if (camadas.condutoresMT) {
      condutores
        .filter(c => c.tipo_rede === 'MT')
        .forEach(condutor => {
          const origem = postesMap.get(condutor.poste_origem_id);
          const destino = postesMap.get(condutor.poste_destino_id);
          
          if (origem && destino) {
            const linha = new google.maps.Polyline({
              path: [
                { lat: origem.latitude, lng: origem.longitude },
                { lat: destino.latitude, lng: destino.longitude },
              ],
              geodesic: true,
              strokeColor: '#dc2626',
              strokeOpacity: 0.9,
              strokeWeight: 3,
            });
            linha.setMap(map);
            
            // Tooltip no hover
            linha.addListener('mouseover', (e: google.maps.MapMouseEvent) => {
              if (infoWindowRef.current && e.latLng) {
                infoWindowRef.current.setContent(`
                  <div class="info-condutor">
                    <strong>MT ${condutor.tipo_cabo}</strong><br/>
                    ${condutor.comprimento_metros.toFixed(1)}m
                  </div>
                `);
                infoWindowRef.current.setPosition(e.latLng);
                infoWindowRef.current.open(map);
              }
            });
            
            linha.addListener('mouseout', () => {
              infoWindowRef.current?.close();
            });
            
            polylinesRef.current.push(linha);
          }
        });
    }

    // ---------------------------------------------------------------------------
    // Desenhar condutores BT (azul)
    // ---------------------------------------------------------------------------
    
    if (camadas.condutoresBT) {
      condutores
        .filter(c => c.tipo_rede === 'BT')
        .forEach(condutor => {
          const origem = postesMap.get(condutor.poste_origem_id);
          const destino = postesMap.get(condutor.poste_destino_id);
          
          if (origem && destino) {
            const linha = new google.maps.Polyline({
              path: [
                { lat: origem.latitude, lng: origem.longitude },
                { lat: destino.latitude, lng: destino.longitude },
              ],
              geodesic: true,
              strokeColor: '#2563eb',
              strokeOpacity: 0.8,
              strokeWeight: 2,
            });
            linha.setMap(map);
            polylinesRef.current.push(linha);
          }
        });
    }

    // ---------------------------------------------------------------------------
    // Desenhar postes (marcadores circulares coloridos)
    // ---------------------------------------------------------------------------
    
    if (camadas.postes) {
      postes.forEach(poste => {
        const cor = CORES_POSTE[poste.funcao] || '#6b7280';
        
        const marker = new google.maps.Marker({
          position: { lat: poste.latitude, lng: poste.longitude },
          map: map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: poste.tipo === 'existente' ? 6 : 8,
            fillColor: cor,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          title: poste.codigo,
          zIndex: 10,
        });

        marker.addListener('click', () => {
          const equipamentos: string[] = [];
          if (poste.trafo_kva) equipamentos.push(`Trafo ${poste.trafo_kva} kVA`);
          if (poste.chave_fusivel) equipamentos.push('Chave fusível');
          if (poste.para_raios) equipamentos.push('Para-raios');
          if (poste.estai) equipamentos.push('Estai');
          if (poste.aterramento) equipamentos.push('Aterramento');

          const content = `
            <div class="info-poste">
              <h3>${poste.codigo}</h3>
              <table>
                <tr><td>Tipo:</td><td><strong>DT ${poste.altura}/${poste.resistencia}</strong></td></tr>
                <tr><td>Estrutura:</td><td>${poste.estrutura}</td></tr>
                <tr><td>Função:</td><td><span class="badge" style="background:${cor}">${poste.funcao}</span></td></tr>
                <tr><td>Status:</td><td>${poste.tipo === 'existente' ? '⚫ Existente' : '🟢 Novo'}</td></tr>
                ${equipamentos.length > 0 ? `<tr><td>Equip.:</td><td>${equipamentos.join(', ')}</td></tr>` : ''}
                <tr><td>Coord.:</td><td>${poste.latitude.toFixed(6)}, ${poste.longitude.toFixed(6)}</td></tr>
              </table>
            </div>
          `;

          if (infoWindowRef.current) {
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.open(map, marker);
          }

          onPosteClick?.(poste);
        });

        markersRef.current.push(marker);
      });
    }

    // ---------------------------------------------------------------------------
    // Desenhar barreiras (ícones emoji)
    // ---------------------------------------------------------------------------
    
    if (camadas.barreiras) {
      barreiras.forEach(barreira => {
        const marker = new google.maps.Marker({
          position: { lat: barreira.latitude, lng: barreira.longitude },
          map: map,
          label: {
            text: ICONES_BARREIRA[barreira.tipo] || '⚠️',
            fontSize: '20px',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 0,
          },
          title: barreira.descricao,
          zIndex: 20,
        });

        marker.addListener('click', () => {
          const corBarreira = CORES_BARREIRA[barreira.tipo] || '#6b7280';
          const content = `
            <div class="info-barreira ${barreira.severidade.toLowerCase()}" style="border-left: 4px solid ${corBarreira}">
              <h3>${ICONES_BARREIRA[barreira.tipo]} ${barreira.tipo.replace(/_/g, ' ')}</h3>
              <p>${barreira.descricao}</p>
              <span class="severidade">${barreira.severidade}</span>
            </div>
          `;

          if (infoWindowRef.current) {
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.open(map, marker);
          }

          onBarreiraClick?.(barreira);
        });

        markersRef.current.push(marker);
      });
    }

    // ---------------------------------------------------------------------------
    // Desenhar marcadores extras (origem/destino)
    // ---------------------------------------------------------------------------

    marcadores.forEach(marcador => {
      const marker = new google.maps.Marker({
        position: { lat: marcador.posicao.lat, lng: marcador.posicao.lng },
        map: map,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 7,
          fillColor: marcador.cor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        title: marcador.titulo || marcador.label || '',
        label: marcador.label ? {
          text: marcador.label,
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '12px',
        } : undefined,
        zIndex: 5,
      });
      markersRef.current.push(marker);
    });

    // Ajustar bounds para mostrar todos os elementos
    if (postes.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      postes.forEach(p => bounds.extend({ lat: p.latitude, lng: p.longitude }));
      map.fitBounds(bounds, 50);
    } else if (marcadores.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      marcadores.forEach(m => bounds.extend({ lat: m.posicao.lat, lng: m.posicao.lng }));
      map.fitBounds(bounds, 80);
    }

  }, [map, postes, condutores, barreiras, rota, marcadores, camadas, onPosteClick, onBarreiraClick]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mapa-projeto-container">
      {/* Controles de tipo de mapa */}
      <div className="mapa-controles">
        <div className="mapa-tipo-toggle">
          <button
            className={mapType === 'roadmap' ? 'active' : ''}
            onClick={() => setMapType('roadmap')}
          >
            Mapa
          </button>
          <button
            className={mapType === 'satellite' ? 'active' : ''}
            onClick={() => setMapType('satellite')}
          >
            Satélite
          </button>
          <button
            className={mapType === 'hybrid' ? 'active' : ''}
            onClick={() => setMapType('hybrid')}
          >
            Híbrido
          </button>
        </div>
      </div>

      {/* Legenda */}
      <div className="mapa-legenda">
        <h4>Legenda</h4>
        <div className="legenda-item">
          <span className="legenda-cor" style={{ background: CORES_POSTE.TANGENTE }}></span>
          Tangente
        </div>
        <div className="legenda-item">
          <span className="legenda-cor" style={{ background: CORES_POSTE.ANGULO }}></span>
          Ângulo
        </div>
        <div className="legenda-item">
          <span className="legenda-cor" style={{ background: CORES_POSTE.FIM }}></span>
          Fim de linha
        </div>
        <div className="legenda-item">
          <span className="legenda-cor" style={{ background: CORES_POSTE.DERIVACAO }}></span>
          Derivação
        </div>
        <div className="legenda-item">
          <span className="legenda-cor" style={{ background: CORES_POSTE.EQUIPAMENTO }}></span>
          Equipamento
        </div>
        <div className="legenda-divider"></div>
        <div className="legenda-item">
          <span className="legenda-linha mt"></span>
          Rede MT
        </div>
        <div className="legenda-item">
          <span className="legenda-linha bt"></span>
          Rede BT
        </div>
      </div>

      {/* Container do mapa */}
      <div ref={mapRef} className="mapa-container" />
    </div>
  );
};

export default MapaProjeto;
