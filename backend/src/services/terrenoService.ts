// =============================================================================
// Serviço: Classificação de Terreno e Grid de Custos
// =============================================================================
//
// Este serviço classifica o terreno ao longo da rota e gera o grid de custos
// para o algoritmo A*. No MVP, usa dados do OSM (landuse, natural, highway)
// como proxy do MapBiomas.
//
// Futuramente: integrar GeoTIFF do MapBiomas para maior precisão.
//
// =============================================================================

import { Coordenada, BoundingBox, DadosTerreno, Rua, Edificacao, Obstaculo } from './osmService';
import { PerfilAltimetrico, PontoElevacao } from './elevacaoService';
import { calcularDistanciaMetros as distanciaMetros, distanciaPontoPolilinha, distanciaPontoSegmento } from '../utils/geo';

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

// Resolução padrão do grid em metros
const RESOLUCAO_PADRAO_METROS = 10;

// -----------------------------------------------------------------------------
// Tabelas de Custos
// -----------------------------------------------------------------------------

/**
 * Custos por tipo de terreno para o grid A*
 * Valores maiores = mais difícil/custoso de atravessar
 */
export const CUSTOS_TERRENO = {
  // Estradas (preferível para rede elétrica)
  estrada_principal: 1.0,   // trunk, primary, secondary - ideal
  estrada_local: 1.5,       // residential, tertiary
  estrada_rural: 2.0,       // track, unclassified, service

  // Terrenos naturais
  pastagem: 3.0,            // landuse=meadow, landuse=grass
  campo_aberto: 3.0,        // sem classificação específica
  agricultura: 5.0,         // landuse=farmland
  silvicultura: 8.0,        // landuse=forest (plantado)
  floresta: 15.0,           // natural=wood (nativa) - requer poda/faixa

  // Obstáculos severos
  area_alagada: 50.0,       // natural=wetland - evitar
  ferrovia: 30.0,           // travessia possível mas custosa
  corpo_agua: 100.0,        // natural=water, waterway - travessia especial

  // Barreira intransponível
  edificacao: Infinity,     // building=* - não pode passar

  // Área urbana (pode ter rede existente)
  urbano: 2.0,              // landuse=residential, industrial, commercial
} as const;

/**
 * Fatores multiplicadores por declive
 */
export const FATOR_DECLIVE = {
  ate_10: 1.0,     // 0-10% declive - normal
  ate_20: 1.3,     // 10-20% - leve aumento
  ate_30: 1.8,     // 20-30% - aumento moderado
  acima_30: 2.5,   // >30% - aumento significativo
} as const;

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export type TipoTerreno =
  | 'estrada_principal'
  | 'estrada_local'
  | 'estrada_rural'
  | 'pastagem'
  | 'campo_aberto'
  | 'agricultura'
  | 'silvicultura'
  | 'floresta'
  | 'area_alagada'
  | 'ferrovia'
  | 'corpo_agua'
  | 'edificacao'
  | 'urbano';

export interface ClassificacaoTerreno {
  tipo: TipoTerreno;
  custo: number;
  fonte: 'osm' | 'mapbiomas';
}

export interface GridCustos {
  resolucao: number;      // metros por célula
  bbox: BoundingBox;
  largura: number;        // número de colunas
  altura: number;         // número de linhas
  dados: number[][];      // matriz de custos [linha][coluna]
}

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Verifica se um ponto está dentro de um polígono (Ray casting)
 */
function pontoEmPoligono(ponto: Coordenada, poligono: Coordenada[]): boolean {
  if (poligono.length < 3) return false;

  let dentro = false;
  const n = poligono.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poligono[i].lat, yi = poligono[i].lng;
    const xj = poligono[j].lat, yj = poligono[j].lng;

    if (((yi > ponto.lng) !== (yj > ponto.lng)) &&
        (ponto.lat < (xj - xi) * (ponto.lng - yi) / (yj - yi) + xi)) {
      dentro = !dentro;
    }
  }

  return dentro;
}

/**
 * Classifica tipo de highway do OSM para nosso sistema
 */
function classificarTipoEstrada(tipoHighway: string): TipoTerreno {
  const principais = ['trunk', 'primary', 'secondary'];
  const locais = ['tertiary', 'residential'];
  const rurais = ['track', 'unclassified', 'service', 'path', 'footway'];

  if (principais.includes(tipoHighway)) return 'estrada_principal';
  if (locais.includes(tipoHighway)) return 'estrada_local';
  if (rurais.includes(tipoHighway)) return 'estrada_rural';

  return 'estrada_local'; // default
}

/**
 * Obtém fator de declive baseado no percentual
 */
function obterFatorDeclive(declivePercentual: number): number {
  const decliveAbs = Math.abs(declivePercentual);

  if (decliveAbs <= 10) return FATOR_DECLIVE.ate_10;
  if (decliveAbs <= 20) return FATOR_DECLIVE.ate_20;
  if (decliveAbs <= 30) return FATOR_DECLIVE.ate_30;
  return FATOR_DECLIVE.acima_30;
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const terrenoService = {
  /**
   * Classifica o tipo de terreno em uma coordenada específica
   * Usa dados do OSM (ruas, edificações, obstáculos)
   */
  classificarPonto(coord: Coordenada, dadosTerreno: DadosTerreno): ClassificacaoTerreno {
    const { ruas, edificacoes, obstaculos } = dadosTerreno;

    // 1. Verificar se está dentro de uma edificação (barreira)
    for (const edificacao of edificacoes) {
      if (pontoEmPoligono(coord, edificacao.pontos)) {
        return {
          tipo: 'edificacao',
          custo: CUSTOS_TERRENO.edificacao,
          fonte: 'osm',
        };
      }
    }

    // 2. Verificar obstáculos (água, ferrovia, etc.)
    for (const obstaculo of obstaculos) {
      // Para polígonos (lagos, áreas verdes)
      if (obstaculo.pontos.length >= 3 && pontoEmPoligono(coord, obstaculo.pontos)) {
        switch (obstaculo.tipo) {
          case 'rio':
          case 'lago':
            return {
              tipo: 'corpo_agua',
              custo: CUSTOS_TERRENO.corpo_agua,
              fonte: 'osm',
            };
          case 'ferrovia':
            return {
              tipo: 'ferrovia',
              custo: CUSTOS_TERRENO.ferrovia,
              fonte: 'osm',
            };
          case 'area_verde':
            return {
              tipo: 'floresta',
              custo: CUSTOS_TERRENO.floresta,
              fonte: 'osm',
            };
        }
      }

      // Para linhas (rios, ferrovias) - verificar proximidade
      if (obstaculo.pontos.length >= 2) {
        const distancia = distanciaPontoPolilinha(coord, obstaculo.pontos);

        // Considerar "dentro" se estiver a menos de 10m
        if (distancia < 10) {
          switch (obstaculo.tipo) {
            case 'rio':
              return {
                tipo: 'corpo_agua',
                custo: CUSTOS_TERRENO.corpo_agua,
                fonte: 'osm',
              };
            case 'ferrovia':
              return {
                tipo: 'ferrovia',
                custo: CUSTOS_TERRENO.ferrovia,
                fonte: 'osm',
              };
            case 'linha_transmissao':
              // LT existente não é obstáculo, mas precisa manter distância
              // Custo moderado para evitar proximidade excessiva
              return {
                tipo: 'campo_aberto',
                custo: CUSTOS_TERRENO.campo_aberto * 1.5,
                fonte: 'osm',
              };
          }
        }
      }
    }

    // 3. Verificar se está em/perto de uma rua (preferencial)
    let ruaMaisProxima: Rua | null = null;
    let menorDistanciaRua = Infinity;

    for (const rua of ruas) {
      const distancia = distanciaPontoPolilinha(coord, rua.pontos);
      if (distancia < menorDistanciaRua) {
        menorDistanciaRua = distancia;
        ruaMaisProxima = rua;
      }
    }

    // Se está a menos de 15m de uma rua, considera na rua
    if (ruaMaisProxima && menorDistanciaRua < 15) {
      const tipoEstrada = classificarTipoEstrada(ruaMaisProxima.tipo);
      return {
        tipo: tipoEstrada,
        custo: CUSTOS_TERRENO[tipoEstrada],
        fonte: 'osm',
      };
    }

    // 4. Default: campo aberto
    return {
      tipo: 'campo_aberto',
      custo: CUSTOS_TERRENO.campo_aberto,
      fonte: 'osm',
    };
  },

  /**
   * Gera grid de custos para o algoritmo A*
   * Cada célula contém o custo de atravessar aquela área
   */
  gerarGridCustos(
    dadosTerreno: DadosTerreno,
    bbox: BoundingBox,
    resolucao: number = RESOLUCAO_PADRAO_METROS
  ): GridCustos {
    console.log(`[TERRENO] Gerando grid de custos (resolução: ${resolucao}m)...`);

    // Calcular dimensões do grid
    const larguraMetros = distanciaMetros(
      { lat: bbox.sul, lng: bbox.oeste },
      { lat: bbox.sul, lng: bbox.leste }
    );
    const alturaMetros = distanciaMetros(
      { lat: bbox.sul, lng: bbox.oeste },
      { lat: bbox.norte, lng: bbox.oeste }
    );

    const largura = Math.ceil(larguraMetros / resolucao);
    const altura = Math.ceil(alturaMetros / resolucao);

    console.log(`[TERRENO] Grid: ${largura}x${altura} células (${largura * altura} total)`);

    // Conversão de graus para metros (aproximado)
    const metrosPorGrauLat = 111000;
    const metrosPorGrauLng = 111000 * Math.cos(((bbox.sul + bbox.norte) / 2) * Math.PI / 180);

    const deltaLat = resolucao / metrosPorGrauLat;
    const deltaLng = resolucao / metrosPorGrauLng;

    // Inicializar grid com custo padrão (campo aberto)
    const dados: number[][] = [];
    for (let i = 0; i < altura; i++) {
      dados[i] = new Array(largura).fill(CUSTOS_TERRENO.campo_aberto);
    }

    // Preencher grid classificando cada célula
    let celulasProcessadas = 0;
    const totalCelulas = largura * altura;

    for (let linha = 0; linha < altura; linha++) {
      for (let coluna = 0; coluna < largura; coluna++) {
        // Coordenada do centro da célula
        const coord: Coordenada = {
          lat: bbox.sul + (linha + 0.5) * deltaLat,
          lng: bbox.oeste + (coluna + 0.5) * deltaLng,
        };

        const classificacao = this.classificarPonto(coord, dadosTerreno);
        dados[linha][coluna] = classificacao.custo;

        celulasProcessadas++;
      }

      // Log de progresso a cada 10%
      if (altura > 10 && linha % Math.floor(altura / 10) === 0) {
        const progresso = Math.round((linha / altura) * 100);
        console.log(`[TERRENO] Progresso: ${progresso}%`);
      }
    }

    // Estatísticas do grid
    let minCusto = Infinity;
    let maxCusto = -Infinity;
    let celulasIntransponiveis = 0;

    for (let i = 0; i < altura; i++) {
      for (let j = 0; j < largura; j++) {
        const custo = dados[i][j];
        if (custo < Infinity) {
          if (custo < minCusto) minCusto = custo;
          if (custo > maxCusto) maxCusto = custo;
        } else {
          celulasIntransponiveis++;
        }
      }
    }

    console.log(`[TERRENO] Grid gerado: custo min=${minCusto.toFixed(1)}, max=${maxCusto.toFixed(1)}, intransponíveis=${celulasIntransponiveis}`);

    return {
      resolucao,
      bbox,
      largura,
      altura,
      dados,
    };
  },

  /**
   * Obtém o custo de uma coordenada específica no grid
   * Retorna Infinity se fora dos limites
   */
  getCusto(grid: GridCustos, coord: Coordenada): number {
    const { bbox, resolucao, largura, altura, dados } = grid;

    // Verificar se está dentro do bbox
    if (coord.lat < bbox.sul || coord.lat > bbox.norte ||
        coord.lng < bbox.oeste || coord.lng > bbox.leste) {
      return Infinity;
    }

    // Conversão de graus para metros
    const metrosPorGrauLat = 111000;
    const metrosPorGrauLng = 111000 * Math.cos(((bbox.sul + bbox.norte) / 2) * Math.PI / 180);

    const deltaLat = resolucao / metrosPorGrauLat;
    const deltaLng = resolucao / metrosPorGrauLng;

    // Calcular índices
    const linha = Math.floor((coord.lat - bbox.sul) / deltaLat);
    const coluna = Math.floor((coord.lng - bbox.oeste) / deltaLng);

    // Verificar limites
    if (linha < 0 || linha >= altura || coluna < 0 || coluna >= largura) {
      return Infinity;
    }

    return dados[linha][coluna];
  },

  /**
   * Aplica fator de custo baseado na elevação/declive ao grid
   * Multiplica o custo de cada célula pelo fator de declive correspondente
   */
  aplicarCustoElevacao(grid: GridCustos, perfil: PerfilAltimetrico): GridCustos {
    if (perfil.pontos.length < 2) {
      console.log('[TERRENO] Perfil altimétrico insuficiente, retornando grid sem alterações');
      return grid;
    }

    console.log('[TERRENO] Aplicando custos de elevação ao grid...');

    const { bbox, resolucao, largura, altura, dados } = grid;

    // Criar cópia dos dados para não modificar o original
    const novosDados: number[][] = dados.map(linha => [...linha]);

    // Conversão de graus para metros
    const metrosPorGrauLat = 111000;
    const metrosPorGrauLng = 111000 * Math.cos(((bbox.sul + bbox.norte) / 2) * Math.PI / 180);

    const deltaLat = resolucao / metrosPorGrauLat;
    const deltaLng = resolucao / metrosPorGrauLng;

    // Para cada célula, encontrar o ponto de elevação mais próximo e calcular declive local
    for (let linha = 0; linha < altura; linha++) {
      for (let coluna = 0; coluna < largura; coluna++) {
        if (novosDados[linha][coluna] === Infinity) continue;

        const coord: Coordenada = {
          lat: bbox.sul + (linha + 0.5) * deltaLat,
          lng: bbox.oeste + (coluna + 0.5) * deltaLng,
        };

        // Encontrar ponto de elevação mais próximo
        let pontoMaisProximo: PontoElevacao | null = null;
        let menorDistancia = Infinity;

        for (const ponto of perfil.pontos) {
          const dist = distanciaMetros(coord, { lat: ponto.lat, lng: ponto.lng });
          if (dist < menorDistancia) {
            menorDistancia = dist;
            pontoMaisProximo = ponto;
          }
        }

        // Se encontrou ponto próximo (< 500m), aplicar fator de declive
        if (pontoMaisProximo && menorDistancia < 500) {
          // Encontrar ponto vizinho para calcular declive local
          const idx = perfil.pontos.indexOf(pontoMaisProximo);
          let decliveLocal = 0;

          if (idx > 0) {
            const anterior = perfil.pontos[idx - 1];
            const distHorizontal = distanciaMetros(
              { lat: anterior.lat, lng: anterior.lng },
              { lat: pontoMaisProximo.lat, lng: pontoMaisProximo.lng }
            );
            if (distHorizontal > 0) {
              decliveLocal = Math.abs((pontoMaisProximo.elevacao - anterior.elevacao) / distHorizontal) * 100;
            }
          } else if (idx < perfil.pontos.length - 1) {
            const proximo = perfil.pontos[idx + 1];
            const distHorizontal = distanciaMetros(
              { lat: pontoMaisProximo.lat, lng: pontoMaisProximo.lng },
              { lat: proximo.lat, lng: proximo.lng }
            );
            if (distHorizontal > 0) {
              decliveLocal = Math.abs((proximo.elevacao - pontoMaisProximo.elevacao) / distHorizontal) * 100;
            }
          }

          const fator = obterFatorDeclive(decliveLocal);
          novosDados[linha][coluna] *= fator;
        }
      }
    }

    console.log('[TERRENO] Custos de elevação aplicados');

    return {
      ...grid,
      dados: novosDados,
    };
  },

  /**
   * Retorna a classificação de terreno para um conjunto de coordenadas
   * Útil para relatórios e visualização
   */
  classificarRota(rota: Coordenada[], dadosTerreno: DadosTerreno): ClassificacaoTerreno[] {
    return rota.map(coord => this.classificarPonto(coord, dadosTerreno));
  },

  /**
   * Calcula estatísticas do grid de custos
   */
  estatisticasGrid(grid: GridCustos): {
    celulasTotal: number;
    celulasIntransponiveis: number;
    custoMedio: number;
    custoMinimo: number;
    custoMaximo: number;
    distribuicao: Record<string, number>;
  } {
    let soma = 0;
    let count = 0;
    let minimo = Infinity;
    let maximo = -Infinity;
    let intransponiveis = 0;

    const distribuicao: Record<string, number> = {
      'muito_baixo': 0,   // 1-2
      'baixo': 0,         // 2-5
      'medio': 0,         // 5-15
      'alto': 0,          // 15-50
      'muito_alto': 0,    // 50-100
      'intransponivel': 0 // Infinity
    };

    for (const linha of grid.dados) {
      for (const custo of linha) {
        if (custo === Infinity) {
          intransponiveis++;
          distribuicao['intransponivel']++;
        } else {
          soma += custo;
          count++;
          if (custo < minimo) minimo = custo;
          if (custo > maximo) maximo = custo;

          if (custo <= 2) distribuicao['muito_baixo']++;
          else if (custo <= 5) distribuicao['baixo']++;
          else if (custo <= 15) distribuicao['medio']++;
          else if (custo <= 50) distribuicao['alto']++;
          else distribuicao['muito_alto']++;
        }
      }
    }

    return {
      celulasTotal: grid.largura * grid.altura,
      celulasIntransponiveis: intransponiveis,
      custoMedio: count > 0 ? soma / count : 0,
      custoMinimo: minimo === Infinity ? 0 : minimo,
      custoMaximo: maximo === -Infinity ? 0 : maximo,
      distribuicao,
    };
  },

  /**
   * Exporta constantes de custos para uso em outros módulos
   */
  getCustosTerreno(): typeof CUSTOS_TERRENO {
    return CUSTOS_TERRENO;
  },

  /**
   * Exporta fatores de declive para uso em outros módulos
   */
  getFatoresDeclive(): typeof FATOR_DECLIVE {
    return FATOR_DECLIVE;
  },
};

export default terrenoService;
