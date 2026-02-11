// =============================================================================
// Patch: Adicionar função gerarRelatorio ao barreirasService
// =============================================================================
// 
// Adicione esta função ao barreirasService.ts existente
//
// =============================================================================

// Adicione ao final do objeto barreirasService, antes do fechamento }:

/**
 * Gera relatório a partir de uma lista de barreiras já processada
 * Usado para combinar barreiras de múltiplas fontes (OSM + Google Maps)
 */
/*
gerarRelatorio(barreiras: Barreira[]): RelatorioBarreiras {
  // Contadores por tipo
  const resumo = {
    total: barreiras.length,
    criticas: 0,
    avisos: 0,
    informativas: 0,
    travessias_hidricas: 0,
    travessias_ferroviarias: 0,
    travessias_rodoviarias: 0,
    travessias_lt: 0,
    areas_verdes: 0,
    arvores_poda: 0,
    declives: 0,
  };

  for (const barreira of barreiras) {
    // Contar por severidade
    if (barreira.severidade === 'CRITICO') {
      resumo.criticas++;
    } else if (barreira.severidade === 'AVISO') {
      resumo.avisos++;
    } else {
      resumo.informativas++;
    }

    // Contar por tipo
    switch (barreira.tipo) {
      case 'TRAVESSIA_HIDRICA':
        resumo.travessias_hidricas++;
        break;
      case 'TRAVESSIA_FERROVIARIA':
        resumo.travessias_ferroviarias++;
        break;
      case 'TRAVESSIA_RODOVIARIA':
        resumo.travessias_rodoviarias++;
        break;
      case 'TRAVESSIA_LT':
        resumo.travessias_lt++;
        break;
      case 'PODA_FAIXA':
        resumo.areas_verdes++;
        break;
      case 'PODA_ARVORE':
        resumo.arvores_poda++;
        break;
      case 'DECLIVE_ACENTUADO':
        resumo.declives++;
        break;
    }
  }

  return {
    barreiras,
    resumo,
  };
},
*/

// =============================================================================
// Arquivo completo atualizado do barreirasService
// =============================================================================

import { Coordenada, DadosTerreno, Obstaculo } from './osmService';
import { PerfilAltimetrico } from './elevacaoService';
import { calcularDistancia } from '../utils/geo';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface PosteGerado {
  id: string;
  codigo: string;
  latitude: number;
  longitude: number;
  altura: number;
  resistencia: number;
  estrutura: string;
  tipo: 'existente' | 'novo';
}

export interface Barreira {
  id: string;
  tipo: TipoBarreira;
  descricao: string;
  poste_antes_id: string;
  poste_depois_id: string;
  coordenada?: Coordenada;
  distancia_metros?: number;
  severidade: 'CRITICO' | 'AVISO' | 'INFO';
  impacto: ImpactoBarreira;
  nome?: string;
  fonte?: string;
}

export type TipoBarreira = 
  | 'TRAVESSIA_HIDRICA'
  | 'TRAVESSIA_FERROVIARIA' 
  | 'TRAVESSIA_RODOVIARIA'
  | 'TRAVESSIA_LT'
  | 'PODA_FAIXA'
  | 'PODA_ARVORE'
  | 'DECLIVE_ACENTUADO';

export interface ImpactoBarreira {
  altura_minima?: number;
  faixa_servidao?: number;
  observacao: string;
  requer_autorizacao: boolean;
  orgao_autorizador?: string;
}

export interface RelatorioBarreiras {
  barreiras: Barreira[];
  resumo: {
    total: number;
    criticas: number;
    avisos: number;
    informativas: number;
    travessias_hidricas: number;
    travessias_ferroviarias: number;
    travessias_rodoviarias: number;
    travessias_lt: number;
    areas_verdes: number;
    arvores_poda: number;
    declives: number;
  };
}

// -----------------------------------------------------------------------------
// Configurações de Impacto por Tipo
// -----------------------------------------------------------------------------

const IMPACTO_POR_TIPO: Record<TipoBarreira, ImpactoBarreira> = {
  TRAVESSIA_HIDRICA: {
    altura_minima: 6,
    faixa_servidao: 15,
    observacao: 'Travessia de corpo d\'água requer altura mínima de 6m e autorização da Marinha/ANA.',
    requer_autorizacao: true,
    orgao_autorizador: 'Marinha do Brasil / ANA',
  },
  TRAVESSIA_FERROVIARIA: {
    altura_minima: 9,
    faixa_servidao: 20,
    observacao: 'Travessia ferroviária requer altura mínima de 9m e autorização da ANTT/concessionária.',
    requer_autorizacao: true,
    orgao_autorizador: 'ANTT / Concessionária',
  },
  TRAVESSIA_RODOVIARIA: {
    altura_minima: 7,
    faixa_servidao: 15,
    observacao: 'Travessia rodoviária requer altura mínima conforme classe da rodovia.',
    requer_autorizacao: true,
    orgao_autorizador: 'DNIT / DER',
  },
  TRAVESSIA_LT: {
    altura_minima: 6,
    faixa_servidao: 25,
    observacao: 'Cruzamento com linha de transmissão requer distância mínima de segurança.',
    requer_autorizacao: true,
    orgao_autorizador: 'Proprietário da LT',
  },
  PODA_FAIXA: {
    faixa_servidao: 6,
    observacao: 'Área de vegetação requer poda para manter faixa de segurança de 3m cada lado.',
    requer_autorizacao: false,
  },
  PODA_ARVORE: {
    faixa_servidao: 4,
    observacao: 'Poda de galhos necessária para manter faixa de segurança.',
    requer_autorizacao: false,
  },
  DECLIVE_ACENTUADO: {
    observacao: 'Declive superior a 20% - verificar necessidade de estrutura especial.',
    requer_autorizacao: false,
  },
};

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

function distanciaPontoSegmento(ponto: Coordenada, p1: Coordenada, p2: Coordenada): number {
  const A = ponto.lat - p1.lat;
  const B = ponto.lng - p1.lng;
  const C = p2.lat - p1.lat;
  const D = p2.lng - p1.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = lenSq !== 0 ? dot / lenSq : -1;

  let xx, yy;
  if (param < 0) {
    xx = p1.lat; yy = p1.lng;
  } else if (param > 1) {
    xx = p2.lat; yy = p2.lng;
  } else {
    xx = p1.lat + param * C;
    yy = p1.lng + param * D;
  }

  return calcularDistancia(ponto, { lat: xx, lng: yy });
}

function verificarIntersecao(
  segmentoA1: Coordenada,
  segmentoA2: Coordenada,
  segmentoB1: Coordenada,
  segmentoB2: Coordenada
): Coordenada | null {
  const d1 = (segmentoB2.lng - segmentoB1.lng) * (segmentoA1.lat - segmentoB1.lat) -
             (segmentoB2.lat - segmentoB1.lat) * (segmentoA1.lng - segmentoB1.lng);
  const d2 = (segmentoB2.lng - segmentoB1.lng) * (segmentoA2.lat - segmentoA1.lat) -
             (segmentoB2.lat - segmentoB1.lat) * (segmentoA2.lng - segmentoA1.lng);
  const d3 = (segmentoA2.lng - segmentoA1.lng) * (segmentoA1.lat - segmentoB1.lat) -
             (segmentoA2.lat - segmentoA1.lat) * (segmentoA1.lng - segmentoB1.lng);

  if (Math.abs(d2) < 1e-10) return null;

  const ua = d1 / d2;
  const ub = d3 / d2;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      lat: segmentoA1.lat + ua * (segmentoA2.lat - segmentoA1.lat),
      lng: segmentoA1.lng + ua * (segmentoA2.lng - segmentoA1.lng),
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const barreirasService = {
  /**
   * Detecta todas as barreiras ao longo da rede
   */
  detectarBarreiras(
    postes: PosteGerado[],
    dadosTerreno: DadosTerreno,
    perfil: PerfilAltimetrico
  ): RelatorioBarreiras {
    console.log('[BARREIRAS] Iniciando detecção...');
    
    const barreiras: Barreira[] = [];
    let contadorId = 0;

    // Contar obstáculos por tipo
    const qtdArvores = dadosTerreno.obstaculos.filter(o => o.tipo === 'arvore').length;
    const qtdAreaVerde = dadosTerreno.obstaculos.filter(o =>
      o.tipo === 'area_verde'
    ).length;

    console.log(`[BARREIRAS] Obstáculos disponíveis: ${dadosTerreno.obstaculos.length} total (${qtdArvores} árvores, ${qtdAreaVerde} áreas verdes)`);

    // Para cada par de postes consecutivos
    for (let i = 0; i < postes.length - 1; i++) {
      const posteAntes = postes[i];
      const posteDepois = postes[i + 1];
      
      const coordAntes: Coordenada = { lat: posteAntes.latitude, lng: posteAntes.longitude };
      const coordDepois: Coordenada = { lat: posteDepois.latitude, lng: posteDepois.longitude };

      // 1. Verificar travessias de obstáculos
      for (const obstaculo of dadosTerreno.obstaculos) {
        // Verificar interseção com cada segmento do obstáculo
        for (let j = 0; j < obstaculo.pontos.length - 1; j++) {
          const intersecao = verificarIntersecao(
            coordAntes,
            coordDepois,
            obstaculo.pontos[j],
            obstaculo.pontos[j + 1]
          );

          if (intersecao) {
            const tipoBarreira = this.classificarObstaculo(obstaculo);
            const impacto = IMPACTO_POR_TIPO[tipoBarreira];
            
            barreiras.push({
              id: `BAR_${++contadorId}`,
              tipo: tipoBarreira,
              descricao: `Travessia de ${obstaculo.nome || obstaculo.tipo}`,
              poste_antes_id: posteAntes.id,
              poste_depois_id: posteDepois.id,
              coordenada: intersecao,
              distancia_metros: calcularDistancia(coordAntes, intersecao),
              severidade: impacto.requer_autorizacao ? 'CRITICO' : 'AVISO',
              impacto,
              nome: obstaculo.nome,
            });
          }
        }

        // 2. Verificar árvores próximas (tipo = 'arvore')
        if (obstaculo.tipo === 'arvore' && obstaculo.pontos.length === 1) {
          const distancia = distanciaPontoSegmento(obstaculo.pontos[0], coordAntes, coordDepois);
          
          if (distancia <= 5) { // Árvore a menos de 5m da rede
            barreiras.push({
              id: `BAR_${++contadorId}`,
              tipo: 'PODA_ARVORE',
              descricao: `Árvore a ${distancia.toFixed(1)}m da rede`,
              poste_antes_id: posteAntes.id,
              poste_depois_id: posteDepois.id,
              coordenada: obstaculo.pontos[0],
              distancia_metros: distancia,
              severidade: 'INFO',
              impacto: IMPACTO_POR_TIPO.PODA_ARVORE,
              nome: obstaculo.nome,
            });
          }
        }
      }

      // 3. Verificar declive acentuado
      if (perfil.decliveMaximo > 20) {
        barreiras.push({
          id: `BAR_${++contadorId}`,
          tipo: 'DECLIVE_ACENTUADO',
          descricao: `Declive de ${perfil.decliveMaximo.toFixed(1)}% no trecho`,
          poste_antes_id: posteAntes.id,
          poste_depois_id: posteDepois.id,
          severidade: perfil.decliveMaximo > 35 ? 'CRITICO' : 'AVISO',
          impacto: {
            ...IMPACTO_POR_TIPO.DECLIVE_ACENTUADO,
            observacao: `Declive de ${perfil.decliveMaximo.toFixed(1)}% - ${
              perfil.decliveMaximo > 35 ? 'requer estrutura especial' : 'verificar fundação'
            }`,
          },
        });
      }
    }

    // Gerar relatório
    const relatorio = this.gerarRelatorio(barreiras);
    
    console.log(`[BARREIRAS] Detectadas: ${relatorio.resumo.total} barreiras`);
    console.log(`[BARREIRAS]   - Críticas: ${relatorio.resumo.criticas}`);
    console.log(`[BARREIRAS]   - Avisos: ${relatorio.resumo.avisos}`);
    console.log(`[BARREIRAS]   - Info: ${relatorio.resumo.informativas}`);
    if (relatorio.resumo.arvores_poda > 0) {
      console.log(`[BARREIRAS]   - Árvores para poda: ${relatorio.resumo.arvores_poda}`);
    }

    return relatorio;
  },

  /**
   * Classifica um obstáculo no tipo de barreira correspondente
   */
  classificarObstaculo(obstaculo: Obstaculo): TipoBarreira {
    const tipo = obstaculo.tipo.toLowerCase();
    
    if (tipo === 'rio' || tipo === 'lago' || tipo === 'agua' || tipo === 'water') {
      return 'TRAVESSIA_HIDRICA';
    }
    if (tipo === 'ferrovia' || tipo === 'railway' || tipo === 'rail') {
      return 'TRAVESSIA_FERROVIARIA';
    }
    if (tipo === 'rodovia' || tipo === 'highway' || tipo === 'road') {
      return 'TRAVESSIA_RODOVIARIA';
    }
    if (tipo === 'lt' || tipo === 'linha_transmissao' || tipo === 'power') {
      return 'TRAVESSIA_LT';
    }
    if (tipo === 'arvore' || tipo === 'tree') {
      return 'PODA_ARVORE';
    }
    
    // Default: área verde/vegetação
    return 'PODA_FAIXA';
  },

  /**
   * Gera relatório a partir de uma lista de barreiras
   */
  gerarRelatorio(barreiras: Barreira[]): RelatorioBarreiras {
    const resumo = {
      total: barreiras.length,
      criticas: 0,
      avisos: 0,
      informativas: 0,
      travessias_hidricas: 0,
      travessias_ferroviarias: 0,
      travessias_rodoviarias: 0,
      travessias_lt: 0,
      areas_verdes: 0,
      arvores_poda: 0,
      declives: 0,
    };

    for (const barreira of barreiras) {
      // Contar por severidade
      if (barreira.severidade === 'CRITICO') {
        resumo.criticas++;
      } else if (barreira.severidade === 'AVISO') {
        resumo.avisos++;
      } else {
        resumo.informativas++;
      }

      // Contar por tipo
      switch (barreira.tipo) {
        case 'TRAVESSIA_HIDRICA':
          resumo.travessias_hidricas++;
          break;
        case 'TRAVESSIA_FERROVIARIA':
          resumo.travessias_ferroviarias++;
          break;
        case 'TRAVESSIA_RODOVIARIA':
          resumo.travessias_rodoviarias++;
          break;
        case 'TRAVESSIA_LT':
          resumo.travessias_lt++;
          break;
        case 'PODA_FAIXA':
          resumo.areas_verdes++;
          break;
        case 'PODA_ARVORE':
          resumo.arvores_poda++;
          break;
        case 'DECLIVE_ACENTUADO':
          resumo.declives++;
          break;
      }
    }

    return { barreiras, resumo };
  },
};

export default barreirasService;
