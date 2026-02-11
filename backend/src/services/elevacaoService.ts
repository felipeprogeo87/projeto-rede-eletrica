// =============================================================================
// Serviço: Elevação (Open-Elevation / SRTM 30m)
// =============================================================================
//
// Este serviço consulta dados de elevação via API Open-Elevation (SRTM 30m):
// - Obtém elevação de pontos específicos
// - Calcula perfil altimétrico ao longo de uma rota
// - Identifica declives e baixadas (possíveis áreas alagáveis)
//
// API utilizada: https://api.opentopodata.org/v1/srtm30m
// Rate limit: 1 req/s, máx 100 pontos por request
//
// =============================================================================

import axios from 'axios';
import { Coordenada } from './osmService';
import { calcularDistanciaMetros } from '../utils/geo';

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

const OPEN_ELEVATION_URL = 'https://api.opentopodata.org/v1/srtm30m';

// Delay entre requests para respeitar rate limit (1.5s para margem de segurança)
const DELAY_ENTRE_REQUESTS_MS = 1500;

// Máximo de pontos por request (API limita em 100)
const MAX_PONTOS_POR_REQUEST = 100;

// Número de pontos para amostragem do perfil altimétrico
const PONTOS_AMOSTRAGEM_PERFIL = 50;

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface PontoElevacao {
  lat: number;
  lng: number;
  elevacao: number; // metros acima do nível do mar
}

export interface PerfilAltimetrico {
  pontos: PontoElevacao[];
  elevacaoMinima: number;
  elevacaoMaxima: number;
  desnivelTotal: number;
  decliveMaximo: number; // percentual
}

// Interface da resposta da API
interface OpenTopoDataResponse {
  results: Array<{
    elevation: number | null;
    location: {
      lat: number;
      lng: number;
    };
  }>;
  status: string;
}

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Aguarda um tempo especificado (para respeitar rate limit)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Interpola pontos ao longo de uma rota para amostragem uniforme
 */
function amostrarPontosRota(rota: Coordenada[], numPontos: number): Coordenada[] {
  if (rota.length < 2) {
    return rota;
  }

  // Calcular distância total da rota
  let distanciaTotal = 0;
  const distancias: number[] = [0];

  for (let i = 1; i < rota.length; i++) {
    distanciaTotal += calcularDistanciaMetros(rota[i - 1], rota[i]);
    distancias.push(distanciaTotal);
  }

  // Se a rota for muito curta, retornar todos os pontos
  if (distanciaTotal < 100 || rota.length <= numPontos) {
    return rota;
  }

  // Interpolar pontos uniformemente distribuídos
  const intervalo = distanciaTotal / (numPontos - 1);
  const pontosAmostrados: Coordenada[] = [];

  for (let i = 0; i < numPontos; i++) {
    const distanciaAlvo = i * intervalo;

    // Encontrar segmento onde está o ponto
    let segmentoIdx = 0;
    for (let j = 1; j < distancias.length; j++) {
      if (distancias[j] >= distanciaAlvo) {
        segmentoIdx = j - 1;
        break;
      }
      segmentoIdx = j - 1;
    }

    // Interpolar dentro do segmento
    const distanciaNoSegmento = distanciaAlvo - distancias[segmentoIdx];
    const comprimentoSegmento = distancias[segmentoIdx + 1] - distancias[segmentoIdx];
    const fator = comprimentoSegmento > 0 ? distanciaNoSegmento / comprimentoSegmento : 0;

    const p1 = rota[segmentoIdx];
    const p2 = rota[Math.min(segmentoIdx + 1, rota.length - 1)];

    pontosAmostrados.push({
      lat: p1.lat + fator * (p2.lat - p1.lat),
      lng: p1.lng + fator * (p2.lng - p1.lng),
    });
  }

  return pontosAmostrados;
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const elevacaoService = {
  /**
   * Busca elevação para uma lista de pontos via API Open-Elevation
   * Divide em lotes de 100 pontos e respeita rate limit
   */
  async buscarElevacao(pontos: Coordenada[]): Promise<PontoElevacao[]> {
    console.log(`[ELEVACAO] Buscando elevação para ${pontos.length} pontos...`);

    if (pontos.length === 0) {
      return [];
    }

    const resultados: PontoElevacao[] = [];
    const lotes: Coordenada[][] = [];

    // Dividir em lotes de MAX_PONTOS_POR_REQUEST
    for (let i = 0; i < pontos.length; i += MAX_PONTOS_POR_REQUEST) {
      lotes.push(pontos.slice(i, i + MAX_PONTOS_POR_REQUEST));
    }

    console.log(`[ELEVACAO] Dividido em ${lotes.length} lote(s)`);

    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];

      // Aguardar entre requests (exceto no primeiro)
      if (i > 0) {
        console.log(`[ELEVACAO] Aguardando rate limit...`);
        await sleep(DELAY_ENTRE_REQUESTS_MS);
      }

      try {
        // Formatar pontos para a API: "lat,lng|lat,lng|..."
        const locationsParam = lote
          .map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
          .join('|');

        const url = `${OPEN_ELEVATION_URL}?locations=${locationsParam}`;

        const response = await axios.get<OpenTopoDataResponse>(url, {
          timeout: 30000, // 30 segundos
        });

        if (response.data.status === 'OK' && response.data.results) {
          for (const result of response.data.results) {
            resultados.push({
              lat: result.location.lat,
              lng: result.location.lng,
              elevacao: result.elevation ?? 0, // null vira 0
            });
          }
          console.log(`[ELEVACAO] Lote ${i + 1}/${lotes.length}: ${response.data.results.length} pontos obtidos`);
        } else {
          console.warn(`[ELEVACAO] Lote ${i + 1}/${lotes.length}: resposta inválida, usando elevação 0`);
          // Fallback: retornar pontos com elevação 0
          for (const ponto of lote) {
            resultados.push({
              lat: ponto.lat,
              lng: ponto.lng,
              elevacao: 0,
            });
          }
        }
      } catch (error: any) {
        console.error(`[ELEVACAO] Erro no lote ${i + 1}/${lotes.length}: ${error.message}`);
        // Fallback: retornar pontos com elevação 0
        for (const ponto of lote) {
          resultados.push({
            lat: ponto.lat,
            lng: ponto.lng,
            elevacao: 0,
          });
        }
      }
    }

    console.log(`[ELEVACAO] Total: ${resultados.length} pontos com elevação`);
    return resultados;
  },

  /**
   * Calcula o perfil altimétrico ao longo de uma rota
   * Amostra ~50 pontos uniformemente distribuídos
   */
  async calcularPerfilAltimetrico(rota: Coordenada[]): Promise<PerfilAltimetrico> {
    console.log(`[ELEVACAO] Calculando perfil altimétrico para rota com ${rota.length} pontos...`);

    if (rota.length === 0) {
      return {
        pontos: [],
        elevacaoMinima: 0,
        elevacaoMaxima: 0,
        desnivelTotal: 0,
        decliveMaximo: 0,
      };
    }

    // Amostrar pontos da rota
    const pontosAmostrados = amostrarPontosRota(rota, PONTOS_AMOSTRAGEM_PERFIL);

    // Buscar elevação dos pontos amostrados
    const pontosComElevacao = await this.buscarElevacao(pontosAmostrados);

    if (pontosComElevacao.length === 0) {
      return {
        pontos: [],
        elevacaoMinima: 0,
        elevacaoMaxima: 0,
        desnivelTotal: 0,
        decliveMaximo: 0,
      };
    }

    // Calcular estatísticas
    let elevacaoMinima = Infinity;
    let elevacaoMaxima = -Infinity;
    let desnivelTotal = 0;
    let decliveMaximo = 0;

    for (let i = 0; i < pontosComElevacao.length; i++) {
      const ponto = pontosComElevacao[i];

      // Min/Max
      if (ponto.elevacao < elevacaoMinima) elevacaoMinima = ponto.elevacao;
      if (ponto.elevacao > elevacaoMaxima) elevacaoMaxima = ponto.elevacao;

      // Desnível acumulado e declive
      if (i > 0) {
        const pontoAnterior = pontosComElevacao[i - 1];
        const diferencaElevacao = Math.abs(ponto.elevacao - pontoAnterior.elevacao);
        desnivelTotal += diferencaElevacao;

        // Calcular declive entre este ponto e o anterior
        const declive = this.calcularDeclive(pontoAnterior, ponto);
        if (Math.abs(declive) > Math.abs(decliveMaximo)) {
          decliveMaximo = declive;
        }
      }
    }

    // Ajustar valores default se não houver dados válidos
    if (elevacaoMinima === Infinity) elevacaoMinima = 0;
    if (elevacaoMaxima === -Infinity) elevacaoMaxima = 0;

    console.log(`[ELEVACAO] Perfil: min=${elevacaoMinima.toFixed(1)}m, max=${elevacaoMaxima.toFixed(1)}m, desnível=${desnivelTotal.toFixed(1)}m, declive max=${decliveMaximo.toFixed(1)}%`);

    return {
      pontos: pontosComElevacao,
      elevacaoMinima,
      elevacaoMaxima,
      desnivelTotal,
      decliveMaximo,
    };
  },

  /**
   * Calcula o declive em percentual entre dois pontos com elevação
   * Declive positivo = subida, negativo = descida
   */
  calcularDeclive(p1: PontoElevacao, p2: PontoElevacao): number {
    const distanciaHorizontal = calcularDistanciaMetros(
      { lat: p1.lat, lng: p1.lng },
      { lat: p2.lat, lng: p2.lng }
    );

    if (distanciaHorizontal === 0) {
      return 0;
    }

    const diferencaElevacao = p2.elevacao - p1.elevacao;
    const declivePercentual = (diferencaElevacao / distanciaHorizontal) * 100;

    return declivePercentual;
  },

  /**
   * Identifica pontos de baixada (elevação relativa baixa) que podem ser áreas alagáveis
   * @param perfil - Perfil altimétrico calculado
   * @param limiarMetros - Diferença mínima abaixo da média para considerar baixada (default: 5m)
   */
  identificarBaixadas(perfil: PerfilAltimetrico, limiarMetros: number = 5): PontoElevacao[] {
    if (perfil.pontos.length === 0) {
      return [];
    }

    // Calcular elevação média
    const somaElevacoes = perfil.pontos.reduce((acc, p) => acc + p.elevacao, 0);
    const elevacaoMedia = somaElevacoes / perfil.pontos.length;

    // Encontrar pontos significativamente abaixo da média
    const baixadas: PontoElevacao[] = [];

    for (const ponto of perfil.pontos) {
      if (elevacaoMedia - ponto.elevacao >= limiarMetros) {
        baixadas.push(ponto);
      }
    }

    console.log(`[ELEVACAO] Identificadas ${baixadas.length} baixadas (limiar: ${limiarMetros}m abaixo da média de ${elevacaoMedia.toFixed(1)}m)`);

    return baixadas;
  },

  /**
   * Verifica se há declives acentuados (>30%) na rota
   * Útil para determinar necessidade de estruturas especiais
   */
  verificarDecliveAcentuado(perfil: PerfilAltimetrico, limiarPercentual: number = 30): boolean {
    return Math.abs(perfil.decliveMaximo) > limiarPercentual;
  },

  /**
   * Retorna o fator de custo baseado no declive
   * Usado para ajustar o grid de custos do roteamento
   */
  obterFatorCustoDeclive(declivePercentual: number): number {
    const decliveAbs = Math.abs(declivePercentual);

    if (decliveAbs <= 10) return 1.0;      // 0-10%: normal
    if (decliveAbs <= 20) return 1.3;      // 10-20%: leve aumento
    if (decliveAbs <= 30) return 1.8;      // 20-30%: aumento moderado
    return 2.5;                             // >30%: aumento significativo
  },
};

export default elevacaoService;
