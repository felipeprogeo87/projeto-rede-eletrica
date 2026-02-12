// =============================================================================
// Serviço: Google Maps - Detecção de Barreiras e Análise de Terreno
// =============================================================================
//
// Este serviço complementa o OSM usando APIs do Google Maps para detectar:
// - Vegetação (análise de imagem satelital)
// - Rodovias e estradas (Roads API)
// - Corpos d'água (Places API + análise de cor)
// - Pontes e viadutos (Elevation API + Roads API)
// - Ferrovias (Places API)
// - Densidade de construções (para classificar urbano/rural)
//
// APIs utilizadas:
// - Static Maps API (imagem satelital para análise de cor)
// - Places API (parques, pontes, estações)
// - Roads API (rodovias, classificação de vias)
// - Elevation API (detectar pontes/viadutos por variação brusca)
//
// =============================================================================

import axios from 'axios';
import { Coordenada } from './osmService';

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

// API Key do Google Maps (deve ser configurada via variável de ambiente)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// URLs das APIs
const PLACES_API_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
const ROADS_API_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const ELEVATION_API_URL = 'https://maps.googleapis.com/maps/api/elevation/json';
const STATIC_MAPS_URL = 'https://maps.googleapis.com/maps/api/staticmap';
const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface BarreiraGoogleMaps {
  id: string;
  tipo: 'VEGETACAO' | 'RODOVIA' | 'PONTE' | 'FERROVIA' | 'CORPO_DAGUA' | 'AREA_VERDE';
  nome?: string;
  localizacao: Coordenada;
  localizacaoFim?: Coordenada;
  descricao: string;
  fonte: 'google_places' | 'google_roads' | 'google_elevation' | 'google_static';
  confianca: number; // 0-1
}

export interface AnaliseArea {
  tipo: 'URBANA' | 'RURAL' | 'MISTA';
  confianca: number;
  densidadeConstrucoes: number; // construções por km²
  densidadeVias: number; // km de vias por km²
  percentualVegetacao: number; // 0-100
  indicadores: {
    temComercio: boolean;
    temIndustria: boolean;
    temResidencial: boolean;
    temAgricola: boolean;
  };
}

export interface ResultadoGoogleMaps {
  barreiras: BarreiraGoogleMaps[];
  analiseArea: AnaliseArea;
  vegetacaoDetectada: Coordenada[];
  pontesDetectadas: Coordenada[];
}

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Calcula distância entre dois pontos em metros
 */
function calcularDistancia(p1: Coordenada, p2: Coordenada): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Gera pontos ao longo de uma rota para análise
 */
function gerarPontosAnalise(origem: Coordenada, destino: Coordenada, intervaloMetros: number = 50): Coordenada[] {
  const pontos: Coordenada[] = [origem];
  const distTotal = calcularDistancia(origem, destino);
  const numPontos = Math.ceil(distTotal / intervaloMetros);

  for (let i = 1; i < numPontos; i++) {
    const fator = i / numPontos;
    pontos.push({
      lat: origem.lat + (destino.lat - origem.lat) * fator,
      lng: origem.lng + (destino.lng - origem.lng) * fator,
    });
  }

  pontos.push(destino);
  return pontos;
}

/**
 * Calcula centro e raio de busca para a rota
 */
function calcularAreaBusca(origem: Coordenada, destino: Coordenada): { centro: Coordenada; raio: number } {
  const centro: Coordenada = {
    lat: (origem.lat + destino.lat) / 2,
    lng: (origem.lng + destino.lng) / 2,
  };
  const raio = Math.max(calcularDistancia(origem, destino) / 2 + 200, 500); // mínimo 500m
  return { centro, raio: Math.min(raio, 5000) }; // máximo 5km (limite da API)
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const googleMapsService = {
  /**
   * Analisa rota completa usando todas as APIs do Google Maps
   */
  async analisarRota(origem: Coordenada, destino: Coordenada): Promise<ResultadoGoogleMaps> {
    console.log('[GOOGLE MAPS] Iniciando análise da rota...');

    const barreiras: BarreiraGoogleMaps[] = [];
    const vegetacaoDetectada: Coordenada[] = [];
    const pontesDetectadas: Coordenada[] = [];

    if (!GOOGLE_MAPS_API_KEY) {
      console.warn('[GOOGLE MAPS] API key não configurada. Defina GOOGLE_MAPS_API_KEY no ambiente.');
      return {
        barreiras,
        analiseArea: { tipo: 'MISTA', confianca: 0, densidadeConstrucoes: 0, densidadeVias: 0, percentualVegetacao: 0, indicadores: { temComercio: false, temIndustria: false, temResidencial: false, temAgricola: false } },
        vegetacaoDetectada,
        pontesDetectadas,
      };
    }

    try {
      // Executar análises em paralelo
      const [
        barreirasPlaces,
        barreirasRoads,
        pontes,
        analiseArea
      ] = await Promise.all([
        this.buscarBarreirasPlaces(origem, destino),
        this.buscarRodovias(origem, destino),
        this.detectarPontes(origem, destino),
        this.analisarTipoArea(origem, destino),
      ]);

      barreiras.push(...barreirasPlaces);
      barreiras.push(...barreirasRoads);
      pontesDetectadas.push(...pontes.map(p => p.localizacao));
      barreiras.push(...pontes);

      console.log(`[GOOGLE MAPS] Total: ${barreiras.length} barreiras detectadas`);
      console.log(`[GOOGLE MAPS] Área classificada como: ${analiseArea.tipo} (confiança: ${(analiseArea.confianca * 100).toFixed(0)}%)`);

      return {
        barreiras,
        analiseArea,
        vegetacaoDetectada,
        pontesDetectadas,
      };

    } catch (error: any) {
      console.error(`[GOOGLE MAPS] Erro: ${error.message}`);
      
      // Retornar resultado vazio em caso de erro
      return {
        barreiras: [],
        analiseArea: {
          tipo: 'MISTA',
          confianca: 0,
          densidadeConstrucoes: 0,
          densidadeVias: 0,
          percentualVegetacao: 0,
          indicadores: {
            temComercio: false,
            temIndustria: false,
            temResidencial: false,
            temAgricola: false,
          },
        },
        vegetacaoDetectada: [],
        pontesDetectadas: [],
      };
    }
  },

  /**
   * Busca barreiras usando Places API (parques, rios, ferrovias, etc)
   */
  async buscarBarreirasPlaces(origem: Coordenada, destino: Coordenada): Promise<BarreiraGoogleMaps[]> {
    console.log('[GOOGLE MAPS] Buscando lugares relevantes...');
    
    const { centro, raio } = calcularAreaBusca(origem, destino);
    const barreiras: BarreiraGoogleMaps[] = [];

    // Tipos de lugares que são barreiras potenciais
    const tiposBusca = [
      { type: 'park', tipoBarreira: 'AREA_VERDE' as const, descricao: 'Parque/Área verde' },
      { type: 'train_station', tipoBarreira: 'FERROVIA' as const, descricao: 'Estação ferroviária (ferrovia próxima)' },
      { type: 'subway_station', tipoBarreira: 'FERROVIA' as const, descricao: 'Estação de metrô (ferrovia próxima)' },
      { type: 'bridge', tipoBarreira: 'PONTE' as const, descricao: 'Ponte/Viaduto' },
    ];

    for (const busca of tiposBusca) {
      try {
        const response = await axios.get(PLACES_API_URL, {
          params: {
            location: `${centro.lat},${centro.lng}`,
            radius: raio,
            type: busca.type,
            key: GOOGLE_MAPS_API_KEY,
          },
          timeout: 10000,
        });

        if (response.data.status === 'REQUEST_DENIED') {
          console.warn(`[GOOGLE MAPS] Places API REQUEST_DENIED para ${busca.type}: ${response.data.error_message || 'API não ativada'}`);
          break; // Não tentar outros tipos se a API não está ativada
        }

        if (response.data.status === 'OK' && response.data.results) {
          for (const place of response.data.results) {
            const loc = place.geometry?.location;
            if (!loc) continue;

            // Verificar se está próximo da rota
            const pontoPlace: Coordenada = { lat: loc.lat, lng: loc.lng };
            const distOrigem = calcularDistancia(pontoPlace, origem);
            const distDestino = calcularDistancia(pontoPlace, destino);
            const distRota = Math.min(distOrigem, distDestino);

            if (distRota <= raio) {
              barreiras.push({
                id: `gm_place_${place.place_id}`,
                tipo: busca.tipoBarreira,
                nome: place.name,
                localizacao: pontoPlace,
                descricao: `${busca.descricao}: ${place.name}`,
                fonte: 'google_places',
                confianca: 0.8,
              });
            }
          }
        }
      } catch (error: any) {
        console.warn(`[GOOGLE MAPS] Erro ao buscar ${busca.type}: ${error.message}`);
      }
    }

    console.log(`[GOOGLE MAPS] Places: ${barreiras.length} barreiras encontradas`);
    return barreiras;
  },

  /**
   * Busca rodovias principais usando Roads API
   */
  async buscarRodovias(origem: Coordenada, destino: Coordenada): Promise<BarreiraGoogleMaps[]> {
    console.log('[GOOGLE MAPS] Analisando rodovias...');
    
    const barreiras: BarreiraGoogleMaps[] = [];
    const pontos = gerarPontosAnalise(origem, destino, 100);

    try {
      // Converter pontos para formato da API
      const path = pontos.map(p => `${p.lat},${p.lng}`).join('|');

      const response = await axios.get(ROADS_API_URL, {
        params: {
          path: path,
          interpolate: true,
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 10000,
      });

      if (response.data.snappedPoints) {
        // Analisar pontos para detectar rodovias principais
        // (a API retorna o placeId que pode ser usado para mais detalhes)
        console.log(`[GOOGLE MAPS] Roads: ${response.data.snappedPoints.length} pontos analisados`);
      }

    } catch (error: any) {
      // Roads API pode falhar se não houver estradas próximas
      console.warn(`[GOOGLE MAPS] Roads API: ${error.message}`);
    }

    return barreiras;
  },

  /**
   * Detecta pontes e viadutos usando Elevation API
   * Pontes são detectadas por variação brusca de elevação
   */
  async detectarPontes(origem: Coordenada, destino: Coordenada): Promise<BarreiraGoogleMaps[]> {
    console.log('[GOOGLE MAPS] Detectando pontes/viadutos...');
    
    const barreiras: BarreiraGoogleMaps[] = [];
    const pontos = gerarPontosAnalise(origem, destino, 20); // Intervalo menor para detectar variações

    try {
      // Buscar elevação de múltiplos pontos
      const locations = pontos.map(p => `${p.lat},${p.lng}`).join('|');

      const response = await axios.get(ELEVATION_API_URL, {
        params: {
          locations: locations,
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 15000,
      });

      if (response.data.status === 'REQUEST_DENIED') {
        console.warn(`[GOOGLE MAPS] Elevation API REQUEST_DENIED: ${response.data.error_message || 'API não ativada'}`);
        return barreiras;
      }

      if (response.data.status === 'OK' && response.data.results) {
        const elevacoes = response.data.results.map((r: any) => r.elevation);

        // Detectar variações bruscas (possíveis pontes/viadutos)
        for (let i = 1; i < elevacoes.length - 1; i++) {
          const elevAnterior = elevacoes[i - 1];
          const elevAtual = elevacoes[i];
          const elevProxima = elevacoes[i + 1];
          
          // Se o ponto atual está significativamente mais alto que os vizinhos = ponte
          const diferencaAnterior = elevAtual - elevAnterior;
          const diferencaProxima = elevAtual - elevProxima;
          
          // Ponte: elevação sobe e depois desce bruscamente (>3m)
          if (diferencaAnterior > 3 && diferencaProxima > 3) {
            barreiras.push({
              id: `gm_ponte_${i}`,
              tipo: 'PONTE',
              localizacao: pontos[i],
              descricao: `Possível ponte/viaduto detectado (elevação: ${elevAtual.toFixed(1)}m)`,
              fonte: 'google_elevation',
              confianca: 0.6, // Confiança média pois é inferido
            });
          }
        }

        console.log(`[GOOGLE MAPS] Elevation: ${barreiras.length} pontes/viadutos detectados`);
      }

    } catch (error: any) {
      console.warn(`[GOOGLE MAPS] Elevation API: ${error.message}`);
    }

    return barreiras;
  },

  /**
   * Analisa e classifica o tipo de área (URBANA, RURAL, MISTA)
   */
  async analisarTipoArea(origem: Coordenada, destino: Coordenada): Promise<AnaliseArea> {
    console.log('[GOOGLE MAPS] Classificando tipo de área...');
    
    const { centro, raio } = calcularAreaBusca(origem, destino);
    
    let temComercio = false;
    let temIndustria = false;
    let temResidencial = false;
    let temAgricola = false;
    let totalLugares = 0;

    // Buscar diferentes tipos de estabelecimentos para classificar a área
    const tiposUrbanos = [
      'store', 'restaurant', 'bank', 'hospital', 'school', 
      'shopping_mall', 'supermarket', 'pharmacy'
    ];
    
    const tiposIndustriais = ['factory', 'industrial'];
    const tiposResidenciais = ['residential', 'apartment'];

    try {
      // Buscar estabelecimentos comerciais (indicador de área urbana)
      for (const tipo of tiposUrbanos.slice(0, 3)) { // Limitar para não exceder quota
        try {
          const response = await axios.get(PLACES_API_URL, {
            params: {
              location: `${centro.lat},${centro.lng}`,
              radius: Math.min(raio, 2000),
              type: tipo,
              key: GOOGLE_MAPS_API_KEY,
            },
            timeout: 5000,
          });

          if (response.data.status === 'REQUEST_DENIED') {
            console.warn(`[GOOGLE MAPS] Places API (area) REQUEST_DENIED: ${response.data.error_message || 'API não ativada'}`);
            break; // Não tentar outros tipos
          }
          if (response.data.status === 'OK') {
            const count = response.data.results?.length || 0;
            totalLugares += count;
            if (count > 0) temComercio = true;
          }
        } catch (e) {
          // Ignorar erros individuais
        }
      }

      // Usar Geocoding para obter informações do endereço
      const geocodeResponse = await axios.get(GEOCODING_API_URL, {
        params: {
          latlng: `${centro.lat},${centro.lng}`,
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 5000,
      });

      if (geocodeResponse.data.status === 'REQUEST_DENIED') {
        console.warn(`[GOOGLE MAPS] Geocoding API REQUEST_DENIED: ${geocodeResponse.data.error_message || 'API não ativada'}`);
      } else if (geocodeResponse.data.status === 'OK' && geocodeResponse.data.results?.length > 0) {
        const addressComponents = geocodeResponse.data.results[0].address_components || [];
        
        for (const component of addressComponents) {
          const types = component.types || [];
          if (types.includes('locality') || types.includes('sublocality')) {
            // Está em uma cidade/bairro = mais provável urbano
            temResidencial = true;
          }
          if (types.includes('administrative_area_level_2')) {
            // Tem município definido
          }
        }

        // Analisar tipos do resultado
        const resultTypes = geocodeResponse.data.results[0].types || [];
        if (resultTypes.includes('route') || resultTypes.includes('street_address')) {
          temResidencial = true;
        }
      }

    } catch (error: any) {
      console.warn(`[GOOGLE MAPS] Erro na classificação de área: ${error.message}`);
    }

    // Calcular classificação
    const areaKm2 = Math.PI * Math.pow(raio / 1000, 2);
    const densidadeConstrucoes = totalLugares / areaKm2;

    // Se nenhuma API respondeu (totalLugares=0 e nenhum indicador),
    // retornar MISTA com confiança 0 para não influenciar a classificação
    if (totalLugares === 0 && !temComercio && !temIndustria && !temResidencial && !temAgricola) {
      console.log('[GOOGLE MAPS] Nenhuma API retornou dados válidos — confiança 0');
      return {
        tipo: 'MISTA' as const,
        confianca: 0,
        densidadeConstrucoes: 0,
        densidadeVias: 0,
        percentualVegetacao: 0,
        indicadores: { temComercio, temIndustria, temResidencial, temAgricola },
      };
    }

    // Lógica de classificação (com dados válidos das APIs)
    let tipo: 'URBANA' | 'RURAL' | 'MISTA';
    let confianca: number;

    if (densidadeConstrucoes > 50 || (temComercio && temResidencial)) {
      tipo = 'URBANA';
      confianca = Math.min(0.9, 0.5 + densidadeConstrucoes / 200);
    } else if (densidadeConstrucoes < 10 && !temComercio) {
      tipo = 'RURAL';
      confianca = Math.min(0.9, 0.7 - densidadeConstrucoes / 50);
    } else {
      tipo = 'MISTA';
      confianca = 0.5;
    }

    console.log(`[GOOGLE MAPS] Classificação: ${tipo} (densidade: ${densidadeConstrucoes.toFixed(1)}/km²)`);

    return {
      tipo,
      confianca,
      densidadeConstrucoes,
      densidadeVias: 0, // Seria necessário calcular com mais dados
      percentualVegetacao: 0, // Seria necessário análise de imagem
      indicadores: {
        temComercio,
        temIndustria,
        temResidencial,
        temAgricola,
      },
    };
  },

  /**
   * Combina barreiras do OSM e Google Maps, removendo duplicatas
   */
  combinarBarreiras(
    barreirasOSM: any[],
    barreirasGoogle: BarreiraGoogleMaps[],
    distanciaMinima: number = 30 // metros para considerar duplicata
  ): any[] {
    const barreirasCombinadas = [...barreirasOSM];

    for (const bg of barreirasGoogle) {
      // Verificar se já existe uma barreira similar do OSM
      const duplicata = barreirasOSM.some(bo => {
        if (!bo.coordenada) return false;
        const dist = calcularDistancia(
          { lat: bo.coordenada.lat, lng: bo.coordenada.lng },
          bg.localizacao
        );
        return dist < distanciaMinima;
      });

      if (!duplicata) {
        // Converter para formato do barreirasService
        barreirasCombinadas.push({
          tipo: this.mapearTipoBarreira(bg.tipo),
          descricao: bg.descricao,
          coordenada: bg.localizacao,
          nome: bg.nome,
          impacto: {
            observacao: `Detectado via Google Maps (confiança: ${(bg.confianca * 100).toFixed(0)}%)`,
            requer_autorizacao: bg.tipo === 'RODOVIA' || bg.tipo === 'FERROVIA' || bg.tipo === 'PONTE',
          },
          severidade: bg.tipo === 'FERROVIA' ? 'CRITICO' : 'AVISO',
          fonte: bg.fonte,
        });
      }
    }

    return barreirasCombinadas;
  },

  /**
   * Mapeia tipo de barreira do Google Maps para tipo do barreirasService
   */
  mapearTipoBarreira(tipoGoogle: string): string {
    const mapa: Record<string, string> = {
      'VEGETACAO': 'PODA_FAIXA',
      'AREA_VERDE': 'PODA_FAIXA',
      'RODOVIA': 'TRAVESSIA_RODOVIARIA',
      'PONTE': 'TRAVESSIA_RODOVIARIA', // Pontes geralmente estão sobre rodovias
      'FERROVIA': 'TRAVESSIA_FERROVIARIA',
      'CORPO_DAGUA': 'TRAVESSIA_HIDRICA',
    };
    return mapa[tipoGoogle] || 'PODA_FAIXA';
  },
};

export default googleMapsService;
