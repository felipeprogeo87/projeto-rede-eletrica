// =============================================================================
// Serviço: Classificação de Área e Regras de Vão
// =============================================================================
//
// Este serviço determina se uma área é URBANA ou RURAL e aplica as regras
// corretas de construção conforme NT EQTL:
//
// ÁREA URBANA:
// - Alta densidade de edificações
// - Vãos menores (segurança)
// - MT: 40-60m (máx 80m)
// - BT: 30-40m (máx 45m)
//
// ÁREA RURAL:
// - Baixa densidade de edificações
// - Vãos maiores (economia)
// - MT: 80-100m (máx 120m)
// - BT: 40-60m (máx 80m)
//
// Fontes de dados:
// - OSM: densidade de edificações e ruas
// - Google Maps: tipos de estabelecimentos
// - Análise combinada para maior precisão
//
// =============================================================================

import { Coordenada, DadosTerreno } from './osmService';
import { googleMapsService, AnaliseArea } from './googleMapsService';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export type TipoArea = 'URBANA' | 'RURAL';

export interface ClassificacaoArea {
  tipo: TipoArea;
  confianca: number; // 0-1
  fontes: {
    osm: TipoArea | null;
    google: TipoArea | null;
  };
  metricas: {
    densidadeEdificacoes: number; // por km²
    densidadeRuas: number; // km por km²
    percentualConstruido: number; // 0-100
  };
}

export interface RegrasVao {
  vaoMinimo: number;
  vaoMaximo: number;
  vaoIdeal: number;
  alturaMinimaMT: number;
  alturaMinimaBT: number;
}

export interface RegrasCompletas {
  tipoArea: TipoArea;
  redesMT: {
    convencional: RegrasVao;
    compacta: RegrasVao;
  };
  redesBT: {
    multiplexada: RegrasVao;
    convencional: RegrasVao;
  };
}

// -----------------------------------------------------------------------------
// Constantes - Regras NT EQTL
// -----------------------------------------------------------------------------

/**
 * Regras de vãos por tipo de área e tipo de rede.
 * Fonte: NT.00005.EQTL Tabela 6.2 — Vãos máximos
 *
 * IMPORTANTE: Para rede conjugada (MT+BT), o vão efetivo é decidido no
 * regrasEquatorialService.obterVaoMaximo(), que é a fonte única de verdade.
 * Esta tabela define os limites por tipo de rede INDIVIDUAL.
 */
const REGRAS_POR_AREA: Record<TipoArea, RegrasCompletas> = {
  URBANA: {
    tipoArea: 'URBANA',
    redesMT: {
      convencional: {
        vaoMinimo: 30,
        vaoMaximo: 80,       // NT.00005: 80m
        vaoIdeal: 50,
        alturaMinimaMT: 6.0,
        alturaMinimaBT: 5.5,
      },
      compacta: {
        vaoMinimo: 25,
        vaoMaximo: 40,       // NT.00005: 40m
        vaoIdeal: 35,
        alturaMinimaMT: 5.5,
        alturaMinimaBT: 5.0,
      },
    },
    redesBT: {
      multiplexada: {
        vaoMinimo: 20,
        vaoMaximo: 35,       // NT.00005: 35m
        vaoIdeal: 30,
        alturaMinimaMT: 0,
        alturaMinimaBT: 5.5,
      },
      convencional: {
        vaoMinimo: 20,
        vaoMaximo: 30,       // NT.00005: 30m
        vaoIdeal: 25,
        alturaMinimaMT: 0,
        alturaMinimaBT: 6.0,
      },
    },
  },
  RURAL: {
    tipoArea: 'RURAL',
    redesMT: {
      convencional: {
        vaoMinimo: 40,
        vaoMaximo: 150,      // NT.00005: 150m
        vaoIdeal: 100,
        alturaMinimaMT: 6.0,
        alturaMinimaBT: 5.5,
      },
      compacta: {
        vaoMinimo: 35,
        vaoMaximo: 80,       // NT.00005: 80m
        vaoIdeal: 60,
        alturaMinimaMT: 5.5,
        alturaMinimaBT: 5.0,
      },
    },
    redesBT: {
      multiplexada: {
        vaoMinimo: 25,
        vaoMaximo: 40,       // NT.00005: 40m
        vaoIdeal: 35,
        alturaMinimaMT: 0,
        alturaMinimaBT: 5.5,
      },
      convencional: {
        vaoMinimo: 25,
        vaoMaximo: 35,       // NT.00005: 35m
        vaoIdeal: 30,
        alturaMinimaMT: 0,
        alturaMinimaBT: 6.0,
      },
    },
  },
};

// Limiares para classificação
const LIMIAR_DENSIDADE_URBANA = 100; // edificações por km²
const LIMIAR_DENSIDADE_RURAL = 20;   // edificações por km²
const LIMIAR_RUAS_URBANA = 10;       // km de ruas por km²

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Calcula área do bounding box em km²
 */
function calcularAreaKm2(bbox: { norte: number; sul: number; leste: number; oeste: number }): number {
  const latMedia = (bbox.norte + bbox.sul) / 2;
  const larguraKm = (bbox.leste - bbox.oeste) * 111 * Math.cos(latMedia * Math.PI / 180);
  const alturaKm = (bbox.norte - bbox.sul) * 111;
  return larguraKm * alturaKm;
}

/**
 * Calcula comprimento total de ruas em km
 */
function calcularExtensaoRuas(ruas: any[]): number {
  let totalMetros = 0;
  
  for (const rua of ruas) {
    if (rua.pontos && rua.pontos.length >= 2) {
      for (let i = 1; i < rua.pontos.length; i++) {
        const p1 = rua.pontos[i - 1];
        const p2 = rua.pontos[i];
        // Distância aproximada em metros
        const dLat = (p2.lat - p1.lat) * 111000;
        const dLng = (p2.lng - p1.lng) * 111000 * Math.cos(p1.lat * Math.PI / 180);
        totalMetros += Math.sqrt(dLat * dLat + dLng * dLng);
      }
    }
  }
  
  return totalMetros / 1000; // Converter para km
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const areaClassifierService = {
  /**
   * Classifica área usando dados do OSM e opcionalmente Google Maps
   */
  async classificarArea(
    origem: Coordenada,
    destino: Coordenada,
    dadosTerreno: DadosTerreno,
    usarGoogleMaps: boolean = true
  ): Promise<ClassificacaoArea> {
    console.log('[CLASSIFICAÇÃO] Analisando tipo de área...');

    // 1. Análise baseada no OSM
    const classificacaoOSM = this.classificarPorOSM(dadosTerreno);
    console.log(`[CLASSIFICAÇÃO] OSM: ${classificacaoOSM.tipo} (confiança: ${(classificacaoOSM.confianca * 100).toFixed(0)}%)`);

    // 2. Análise baseada no Google Maps (se habilitado)
    let classificacaoGoogle: AnaliseArea | null = null;
    if (usarGoogleMaps) {
      try {
        const resultadoGoogle = await googleMapsService.analisarRota(origem, destino);
        classificacaoGoogle = resultadoGoogle.analiseArea;
        console.log(`[CLASSIFICAÇÃO] Google: ${classificacaoGoogle.tipo} (confiança: ${(classificacaoGoogle.confianca * 100).toFixed(0)}%)`);
      } catch (error: any) {
        console.warn(`[CLASSIFICAÇÃO] Erro no Google Maps: ${error.message}`);
      }
    }

    // 3. Combinar resultados
    const classificacaoFinal = this.combinarClassificacoes(classificacaoOSM, classificacaoGoogle);
    
    console.log(`[CLASSIFICAÇÃO] Final: ${classificacaoFinal.tipo} (confiança: ${(classificacaoFinal.confianca * 100).toFixed(0)}%)`);
    console.log(`[CLASSIFICAÇÃO] Métricas: ${classificacaoFinal.metricas.densidadeEdificacoes.toFixed(1)} edif/km², ${classificacaoFinal.metricas.densidadeRuas.toFixed(1)} km ruas/km²`);

    return classificacaoFinal;
  },

  /**
   * Classifica área baseado apenas nos dados do OSM
   */
  classificarPorOSM(dadosTerreno: DadosTerreno): ClassificacaoArea {
    const bbox = dadosTerreno.boundingBox;
    const areaKm2 = calcularAreaKm2(bbox);
    
    // Calcular métricas
    const numEdificacoes = dadosTerreno.edificacoes?.length || 0;
    const densidadeEdificacoes = areaKm2 > 0 ? numEdificacoes / areaKm2 : 0;
    
    const extensaoRuas = calcularExtensaoRuas(dadosTerreno.ruas || []);
    const densidadeRuas = areaKm2 > 0 ? extensaoRuas / areaKm2 : 0;
    
    // Estimar percentual construído (simplificado)
    const percentualConstruido = Math.min(100, densidadeEdificacoes / 5);

    // Classificar
    let tipo: TipoArea;
    let confianca: number;

    if (densidadeEdificacoes >= LIMIAR_DENSIDADE_URBANA || densidadeRuas >= LIMIAR_RUAS_URBANA) {
      tipo = 'URBANA';
      confianca = Math.min(0.9, 0.5 + (densidadeEdificacoes / LIMIAR_DENSIDADE_URBANA) * 0.4);
    } else if (densidadeEdificacoes <= LIMIAR_DENSIDADE_RURAL && densidadeRuas < LIMIAR_RUAS_URBANA / 2) {
      tipo = 'RURAL';
      confianca = Math.min(0.9, 0.7 + (1 - densidadeEdificacoes / LIMIAR_DENSIDADE_RURAL) * 0.2);
    } else {
      // Área intermediária - usar critério mais conservador (urbano = mais seguro)
      tipo = densidadeEdificacoes > LIMIAR_DENSIDADE_RURAL * 2 ? 'URBANA' : 'RURAL';
      confianca = 0.5;
    }

    return {
      tipo,
      confianca,
      fontes: {
        osm: tipo,
        google: null,
      },
      metricas: {
        densidadeEdificacoes,
        densidadeRuas,
        percentualConstruido,
      },
    };
  },

  /**
   * Combina classificações do OSM e Google Maps
   */
  combinarClassificacoes(
    osmClass: ClassificacaoArea,
    googleClass: AnaliseArea | null
  ): ClassificacaoArea {
    if (!googleClass) {
      return osmClass;
    }

    // Converter tipo do Google para TipoArea
    const tipoGoogle: TipoArea = googleClass.tipo === 'URBANA' ? 'URBANA' : 
                                  googleClass.tipo === 'RURAL' ? 'RURAL' : 
                                  'URBANA'; // MISTA considera como urbana por segurança

    // Se ambos concordam, aumentar confiança
    if (osmClass.tipo === tipoGoogle) {
      return {
        ...osmClass,
        confianca: Math.min(0.95, (osmClass.confianca + googleClass.confianca) / 2 + 0.15),
        fontes: {
          osm: osmClass.tipo,
          google: tipoGoogle,
        },
      };
    }

    // Se discordam, usar o mais conservador (urbano) com confiança menor
    // A não ser que um tenha confiança muito maior
    if (osmClass.confianca > googleClass.confianca + 0.3) {
      return {
        ...osmClass,
        confianca: osmClass.confianca - 0.1,
        fontes: {
          osm: osmClass.tipo,
          google: tipoGoogle,
        },
      };
    }

    if (googleClass.confianca > osmClass.confianca + 0.3) {
      return {
        tipo: tipoGoogle,
        confianca: googleClass.confianca - 0.1,
        fontes: {
          osm: osmClass.tipo,
          google: tipoGoogle,
        },
        metricas: osmClass.metricas,
      };
    }

    // Em caso de dúvida, usar URBANA (mais conservador/seguro)
    return {
      tipo: 'URBANA',
      confianca: Math.min(osmClass.confianca, googleClass.confianca),
      fontes: {
        osm: osmClass.tipo,
        google: tipoGoogle,
      },
      metricas: osmClass.metricas,
    };
  },

  /**
   * Obtém regras de vão para o tipo de rede e área
   */
  obterRegrasVao(
    tipoArea: TipoArea,
    tipoRede: 'mt_convencional' | 'mt_compacta' | 'bt_multiplexada' | 'bt_convencional'
  ): RegrasVao {
    const regras = REGRAS_POR_AREA[tipoArea];

    switch (tipoRede) {
      case 'mt_convencional':
        return regras.redesMT.convencional;
      case 'mt_compacta':
        return regras.redesMT.compacta;
      case 'bt_multiplexada':
        return regras.redesBT.multiplexada;
      case 'bt_convencional':
        return regras.redesBT.convencional;
      default:
        return regras.redesMT.convencional;
    }
  },

  /**
   * Obtém todas as regras para uma área
   */
  obterRegrasCompletas(tipoArea: TipoArea): RegrasCompletas {
    return REGRAS_POR_AREA[tipoArea];
  },

  /**
   * Calcula vão ideal considerando terreno e obstáculos
   */
  calcularVaoIdeal(
    tipoArea: TipoArea,
    tipoRede: 'mt_convencional' | 'mt_compacta' | 'bt_multiplexada' | 'bt_convencional',
    temObstaculos: boolean,
    decliveMaximo: number // em percentual
  ): number {
    const regras = this.obterRegrasVao(tipoArea, tipoRede);
    let vaoIdeal = regras.vaoIdeal;

    // Reduzir vão se houver obstáculos
    if (temObstaculos) {
      vaoIdeal = Math.max(regras.vaoMinimo, vaoIdeal * 0.8);
    }

    // Reduzir vão em terrenos muito inclinados (>15%)
    if (decliveMaximo > 15) {
      const fatorReducao = Math.max(0.7, 1 - (decliveMaximo - 15) / 50);
      vaoIdeal = Math.max(regras.vaoMinimo, vaoIdeal * fatorReducao);
    }

    return Math.round(vaoIdeal);
  },

  /**
   * Valida se um vão está dentro dos limites permitidos
   */
  validarVao(
    vao: number,
    tipoArea: TipoArea,
    tipoRede: 'mt_convencional' | 'mt_compacta' | 'bt_multiplexada' | 'bt_convencional'
  ): { valido: boolean; mensagem?: string } {
    const regras = this.obterRegrasVao(tipoArea, tipoRede);

    if (vao < regras.vaoMinimo) {
      return {
        valido: false,
        mensagem: `Vão de ${vao.toFixed(1)}m abaixo do mínimo de ${regras.vaoMinimo}m para área ${tipoArea}`,
      };
    }

    if (vao > regras.vaoMaximo) {
      return {
        valido: false,
        mensagem: `Vão de ${vao.toFixed(1)}m acima do máximo de ${regras.vaoMaximo}m para área ${tipoArea}`,
      };
    }

    return { valido: true };
  },

  /**
   * Exporta constantes para debug/documentação
   */
  getRegras(): typeof REGRAS_POR_AREA {
    return REGRAS_POR_AREA;
  },
};

export default areaClassifierService;
