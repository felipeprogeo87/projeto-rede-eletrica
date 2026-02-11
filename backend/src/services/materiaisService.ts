// =============================================================================
// Serviço: Lista de Materiais (BOM - Bill of Materials)
// =============================================================================
//
// Gera lista completa de materiais para projetos de rede elétrica.
// Baseado nas normas e códigos de materiais da Equatorial Energia.
//
// Categorias de materiais:
// - POSTE: postes, cruzetas, mãos francesas
// - CONDUTOR: cabos MT e BT, conectores, emendas
// - ESTRUTURA: isoladores, ferragens, parafusos
// - EQUIPAMENTO: transformadores, chaves, para-raios
// - ATERRAMENTO: hastes, cordoalha, conectores
// - FERRAGEM: braçadeiras, cintas, suportes
//
// =============================================================================

import {
  ConfigProjeto,
  FuncaoPoste,
  NaturezaRede,
} from './regrasEquatorialService';
import { RelatorioBarreiras, Barreira, PosteGerado } from './barreirasService';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export type CategoriaMaterial =
  | 'POSTE'
  | 'CONDUTOR'
  | 'ESTRUTURA'
  | 'EQUIPAMENTO'
  | 'ATERRAMENTO'
  | 'FERRAGEM';

export type UnidadeMaterial = 'UN' | 'M' | 'KG' | 'CJ' | 'JG' | 'PC';

export interface ItemMaterial {
  codigo: string;           // código do material na distribuidora
  descricao: string;
  unidade: UnidadeMaterial;
  quantidade: number;
  categoria: CategoriaMaterial;
  observacao?: string;
}

export interface CondutorGerado {
  id: string;
  poste_origem_id: string;
  poste_destino_id: string;
  tipo_rede: 'MT' | 'BT';
  tipo_cabo: string;
  comprimento_metros: number;
}

export interface ListaMateriais {
  itens: ItemMaterial[];
  resumo: {
    total_postes: number;
    total_metros_mt: number;
    total_metros_bt: number;
    total_trafos: number;
    total_chaves: number;
    total_aterramentos: number;
    total_itens: number;
  };
}

// Poste com informações estendidas para geração de materiais
export interface PosteComEquipamentos extends PosteGerado {
  funcao: FuncaoPoste;
  trafo_kva?: number;
  chave_fusivel?: boolean;
  chave_faca?: boolean;
  para_raios?: boolean;
  estai?: boolean;
  aterramento?: boolean;
}

// -----------------------------------------------------------------------------
// Catálogo de Materiais Equatorial
// -----------------------------------------------------------------------------

/**
 * Códigos de materiais padrão Equatorial
 * Baseado nas tabelas de materiais da NT.00006.EQTL
 */
const CATALOGO_MATERIAIS = {
  // Postes
  postes: {
    'DT_10_300': { codigo: 'PT-001', descricao: 'POSTE DT 10/300 CONCRETO CLASSE II' },
    'DT_11_300': { codigo: 'PT-002', descricao: 'POSTE DT 11/300 CONCRETO CLASSE II' },
    'DT_11_600': { codigo: 'PT-003', descricao: 'POSTE DT 11/600 CONCRETO CLASSE II' },
    'DT_12_300': { codigo: 'PT-004', descricao: 'POSTE DT 12/300 CONCRETO CLASSE II' },
    'DT_12_600': { codigo: 'PT-005', descricao: 'POSTE DT 12/600 CONCRETO CLASSE II' },
    'DT_12_1000': { codigo: 'PT-006', descricao: 'POSTE DT 12/1000 CONCRETO CLASSE II' },
    'DT_12_1500': { codigo: 'PT-007', descricao: 'POSTE DT 12/1500 CONCRETO CLASSE II' },
    'PQDA_5': { codigo: 'PT-020', descricao: 'POSTE QUADRADO A70 5M' },
    'PQDA_7': { codigo: 'PT-021', descricao: 'POSTE QUADRADO A70 7M' },
  },

  // Cruzetas
  cruzetas: {
    'CRUZETA_MT_2400': { codigo: 'CR-001', descricao: 'CRUZETA MADEIRA TRATADA 2400MM MT' },
    'CRUZETA_MT_2000': { codigo: 'CR-002', descricao: 'CRUZETA MADEIRA TRATADA 2000MM MT' },
    'CRUZETA_BT_1800': { codigo: 'CR-003', descricao: 'CRUZETA MADEIRA TRATADA 1800MM BT' },
    'MAO_FRANCESA': { codigo: 'CR-010', descricao: 'MAO FRANCESA METALICA 900MM' },
    'SUPORTE_SI': { codigo: 'CR-015', descricao: 'SUPORTE PARA REDE SECUNDARIA ISOLADA' },
  },

  // Condutores MT
  condutores_mt: {
    'CAA_2AWG': { codigo: 'CB-001', descricao: 'CABO CAA 2 AWG RAVEN' },
    'CAA_1_0AWG': { codigo: 'CB-002', descricao: 'CABO CAA 1/0 AWG PENGUIN' },
    'CAA_4_0AWG': { codigo: 'CB-003', descricao: 'CABO CAA 4/0 AWG PENGUIN' },
    'CAA_336MCM': { codigo: 'CB-004', descricao: 'CABO CAA 336,4 MCM LINNET' },
    'XLPE_50': { codigo: 'CB-010', descricao: 'CABO XLPE 50MM2 15/25KV COMPACTO' },
    'XLPE_70': { codigo: 'CB-011', descricao: 'CABO XLPE 70MM2 15/25KV COMPACTO' },
    'XLPE_120': { codigo: 'CB-012', descricao: 'CABO XLPE 120MM2 15/25KV COMPACTO' },
    'XLPE_185': { codigo: 'CB-013', descricao: 'CABO XLPE 185MM2 15/25KV COMPACTO' },
  },

  // Condutores BT (Multiplex)
  condutores_bt: {
    'MULT_35_35': { codigo: 'CB-020', descricao: 'CABO MULTIPLEX 35(35)MM2 ALUMINIO' },
    'MULT_70_70': { codigo: 'CB-021', descricao: 'CABO MULTIPLEX 70(70)MM2 ALUMINIO' },
    'MULT_120_70': { codigo: 'CB-022', descricao: 'CABO MULTIPLEX 120(70)MM2 ALUMINIO' },
  },

  // Isoladores
  isoladores: {
    'PINO_15KV': { codigo: 'IS-001', descricao: 'ISOLADOR PINO 15KV PORCELANA' },
    'PINO_25KV': { codigo: 'IS-002', descricao: 'ISOLADOR PINO 25KV PORCELANA' },
    'DISCO_15KV': { codigo: 'IS-010', descricao: 'ISOLADOR DISCO 15KV VIDRO' },
    'DISCO_25KV': { codigo: 'IS-011', descricao: 'ISOLADOR DISCO 25KV VIDRO' },
    'ANCORAGEM_15KV': { codigo: 'IS-020', descricao: 'ISOLADOR ANCORAGEM 15KV POLIMERICO' },
    'ANCORAGEM_25KV': { codigo: 'IS-021', descricao: 'ISOLADOR ANCORAGEM 25KV POLIMERICO' },
    'ESPACADOR_LOSANGULAR': { codigo: 'IS-030', descricao: 'ESPACADOR LOSANGULAR COMPACTA' },
  },

  // Ferragens e conectores
  ferragens: {
    'PARAFUSO_OLHAL': { codigo: 'FE-001', descricao: 'PARAFUSO OLHAL 16X250MM' },
    'PARAFUSO_MAQUINA': { codigo: 'FE-002', descricao: 'PARAFUSO MAQUINA 16X300MM' },
    'ARRUELA_QUADRADA': { codigo: 'FE-003', descricao: 'ARRUELA QUADRADA 50X50X5MM' },
    'GRAMPO_PARALELO': { codigo: 'FE-010', descricao: 'GRAMPO PARALELO ALUMINIO' },
    'CONECTOR_CUNHA': { codigo: 'FE-011', descricao: 'CONECTOR CUNHA DERIVACAO' },
    'CONECTOR_PERFURACAO': { codigo: 'FE-012', descricao: 'CONECTOR PERFURACAO ISOLADO' },
    'ALCA_PREFORMADA': { codigo: 'FE-020', descricao: 'ALCA PREFORMADA CAA' },
    'ESTRIBO_SAIDA': { codigo: 'FE-025', descricao: 'ESTRIBO SAIDA LATERAL' },
    'BRACADEIRA_POSTE': { codigo: 'FE-030', descricao: 'BRACADEIRA PARA POSTE D=160MM' },
    'CINTA_BANDAGEM': { codigo: 'FE-031', descricao: 'CINTA DE ACO INOX 19MM C/ FECHO' },
  },

  // Equipamentos
  equipamentos: {
    // Transformadores
    'TRAFO_15_MONO': { codigo: 'TR-001', descricao: 'TRAFO DISTRIBUICAO 15KVA 13.8/220V MONO' },
    'TRAFO_25_MONO': { codigo: 'TR-002', descricao: 'TRAFO DISTRIBUICAO 25KVA 13.8/220V MONO' },
    'TRAFO_37_5_MONO': { codigo: 'TR-003', descricao: 'TRAFO DISTRIBUICAO 37,5KVA 13.8/220V MONO' },
    'TRAFO_45_TRI': { codigo: 'TR-010', descricao: 'TRAFO DISTRIBUICAO 45KVA 13.8/380V TRI' },
    'TRAFO_75_TRI': { codigo: 'TR-011', descricao: 'TRAFO DISTRIBUICAO 75KVA 13.8/380V TRI' },
    'TRAFO_112_5_TRI': { codigo: 'TR-012', descricao: 'TRAFO DISTRIBUICAO 112,5KVA 13.8/380V TRI' },
    'TRAFO_150_TRI': { codigo: 'TR-013', descricao: 'TRAFO DISTRIBUICAO 150KVA 13.8/380V TRI' },
    'TRAFO_225_TRI': { codigo: 'TR-014', descricao: 'TRAFO DISTRIBUICAO 225KVA 13.8/380V TRI' },

    // Chaves
    'CHAVE_FUSIVEL_15KV': { codigo: 'CH-001', descricao: 'CHAVE FUSIVEL 15KV 100A' },
    'CHAVE_FUSIVEL_25KV': { codigo: 'CH-002', descricao: 'CHAVE FUSIVEL 25KV 100A' },
    'CHAVE_FACA_15KV': { codigo: 'CH-010', descricao: 'CHAVE FACA SECCIONADORA 15KV' },
    'CHAVE_FACA_25KV': { codigo: 'CH-011', descricao: 'CHAVE FACA SECCIONADORA 25KV' },
    'ELO_FUSIVEL_1A': { codigo: 'CH-020', descricao: 'ELO FUSIVEL 1A TIPO H' },
    'ELO_FUSIVEL_2A': { codigo: 'CH-021', descricao: 'ELO FUSIVEL 2A TIPO H' },
    'ELO_FUSIVEL_5A': { codigo: 'CH-022', descricao: 'ELO FUSIVEL 5A TIPO H' },
    'ELO_FUSIVEL_10A': { codigo: 'CH-023', descricao: 'ELO FUSIVEL 10A TIPO K' },
    'ELO_FUSIVEL_25A': { codigo: 'CH-024', descricao: 'ELO FUSIVEL 25A TIPO K' },

    // Para-raios
    'PARA_RAIOS_12KV': { codigo: 'PR-001', descricao: 'PARA-RAIOS POLIMERICO 12KV 10KA' },
    'PARA_RAIOS_21KV': { codigo: 'PR-002', descricao: 'PARA-RAIOS POLIMERICO 21KV 10KA' },
    'PARA_RAIOS_30KV': { codigo: 'PR-003', descricao: 'PARA-RAIOS POLIMERICO 30KV 10KA' },
  },

  // Aterramento
  aterramento: {
    'HASTE_COPPERWELD': { codigo: 'AT-001', descricao: 'HASTE COPPERWELD 5/8X2400MM' },
    'CORDOALHA_COBRE': { codigo: 'AT-002', descricao: 'CORDOALHA COBRE NU 16MM2' },
    'CONECTOR_HASTE': { codigo: 'AT-003', descricao: 'CONECTOR PARA HASTE BRONZE' },
    'CAIXA_INSPECAO': { codigo: 'AT-004', descricao: 'CAIXA INSPECAO ATERRAMENTO PVC' },
    'CONECTOR_SPLIT_BOLT': { codigo: 'AT-005', descricao: 'CONECTOR SPLIT BOLT BRONZE' },
  },

  // Estais
  estais: {
    'CORDOALHA_ACO': { codigo: 'ES-001', descricao: 'CORDOALHA ACO ZINCADO 3/8"' },
    'ANCORA_ANCORA': { codigo: 'ES-002', descricao: 'ANCORA ACO GALVANIZADO 1600MM' },
    'PRESILHA_ESTAI': { codigo: 'ES-003', descricao: 'PRESILHA PARA CORDOALHA ESTAI' },
    'ISOLADOR_ESTAI': { codigo: 'ES-004', descricao: 'ISOLADOR ESTAIAMENTO PORCELANA' },
    'PARAFUSO_ESTAI': { codigo: 'ES-005', descricao: 'PARAFUSO OLHAL ESTAIAMENTO 16X300MM' },
  },
} as const;

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Determina o código do poste baseado em altura e resistência
 */
function obterCodigoPoste(altura: number, resistencia: number): string {
  const key = `DT_${altura}_${resistencia}`;
  if (CATALOGO_MATERIAIS.postes[key as keyof typeof CATALOGO_MATERIAIS.postes]) {
    return key;
  }
  // Fallback para poste mais próximo
  if (altura <= 10) return 'DT_10_300';
  if (resistencia <= 300) return `DT_${altura}_300`;
  if (resistencia <= 600) return `DT_${altura}_600`;
  if (resistencia <= 1000) return `DT_${altura}_1000`;
  return `DT_${altura}_1500`;
}

/**
 * Determina o código do condutor MT baseado na especificação
 */
function obterCodigoCondutorMT(especificacao: string): string {
  const spec = especificacao.toUpperCase();
  if (spec.includes('2 AWG') || spec.includes('2AWG')) return 'CAA_2AWG';
  if (spec.includes('1/0') || spec.includes('1-0')) return 'CAA_1_0AWG';
  if (spec.includes('4/0') || spec.includes('4-0')) return 'CAA_4_0AWG';
  if (spec.includes('336') || spec.includes('MCM')) return 'CAA_336MCM';
  if (spec.includes('50MM') || spec.includes('50 MM')) return 'XLPE_50';
  if (spec.includes('70MM') || spec.includes('70 MM')) return 'XLPE_70';
  if (spec.includes('120MM') || spec.includes('120 MM')) return 'XLPE_120';
  if (spec.includes('185MM') || spec.includes('185 MM')) return 'XLPE_185';
  return 'CAA_1_0AWG'; // default
}

/**
 * Determina o código do condutor BT baseado na especificação
 */
function obterCodigoCondutorBT(especificacao: string): string {
  const spec = especificacao.toUpperCase();
  if (spec.includes('35(35)') || spec.includes('35/35')) return 'MULT_35_35';
  if (spec.includes('70(70)') || spec.includes('70/70')) return 'MULT_70_70';
  if (spec.includes('120(70)') || spec.includes('120/70')) return 'MULT_120_70';
  return 'MULT_35_35'; // default
}

/**
 * Determina código do para-raios baseado na tensão
 */
function obterCodigoParaRaios(tensaoMT: number): string {
  if (tensaoMT <= 13.8) return 'PARA_RAIOS_12KV';
  if (tensaoMT <= 23.1) return 'PARA_RAIOS_21KV';
  return 'PARA_RAIOS_30KV';
}

/**
 * Determina código da chave fusível baseado na tensão
 */
function obterCodigoChaveFusivel(tensaoMT: number): string {
  return tensaoMT <= 15 ? 'CHAVE_FUSIVEL_15KV' : 'CHAVE_FUSIVEL_25KV';
}

/**
 * Determina código da chave faca baseado na tensão
 */
function obterCodigoChaveFaca(tensaoMT: number): string {
  return tensaoMT <= 15 ? 'CHAVE_FACA_15KV' : 'CHAVE_FACA_25KV';
}

/**
 * Determina código do isolador pino baseado na tensão
 */
function obterCodigoIsoladorPino(tensaoMT: number): string {
  return tensaoMT <= 15 ? 'PINO_15KV' : 'PINO_25KV';
}

/**
 * Determina código do isolador ancoragem baseado na tensão
 */
function obterCodigoIsoladorAncoragem(tensaoMT: number): string {
  return tensaoMT <= 15 ? 'ANCORAGEM_15KV' : 'ANCORAGEM_25KV';
}

/**
 * Calcula número de condutores baseado na natureza da rede
 */
function calcularNumCondutores(natureza: NaturezaRede): number {
  switch (natureza) {
    case 'MONOFASICA': return 2; // fase + neutro
    case 'BIFASICA': return 3;   // 2 fases + neutro
    case 'TRIFASICA': return 3;  // 3 fases (neutro em BT)
  }
}

/**
 * Calcula elo fusível adequado para potência do trafo
 */
function obterEloFusivel(trafoKva: number): string {
  if (trafoKva <= 15) return 'ELO_FUSIVEL_1A';
  if (trafoKva <= 25) return 'ELO_FUSIVEL_2A';
  if (trafoKva <= 45) return 'ELO_FUSIVEL_5A';
  if (trafoKva <= 112.5) return 'ELO_FUSIVEL_10A';
  return 'ELO_FUSIVEL_25A';
}

/**
 * Calcula código do transformador baseado na potência e natureza
 */
function obterCodigoTrafo(kva: number, natureza: NaturezaRede): string {
  if (natureza === 'MONOFASICA') {
    if (kva <= 15) return 'TRAFO_15_MONO';
    if (kva <= 25) return 'TRAFO_25_MONO';
    return 'TRAFO_37_5_MONO';
  } else {
    if (kva <= 45) return 'TRAFO_45_TRI';
    if (kva <= 75) return 'TRAFO_75_TRI';
    if (kva <= 112.5) return 'TRAFO_112_5_TRI';
    if (kva <= 150) return 'TRAFO_150_TRI';
    return 'TRAFO_225_TRI';
  }
}

/**
 * Adiciona item à lista, agregando quantidade se já existir
 */
function adicionarItem(
  lista: ItemMaterial[],
  codigo: string,
  descricao: string,
  unidade: UnidadeMaterial,
  quantidade: number,
  categoria: CategoriaMaterial,
  observacao?: string
): void {
  const existente = lista.find(item => item.codigo === codigo);
  if (existente) {
    existente.quantidade += quantidade;
  } else {
    lista.push({ codigo, descricao, unidade, quantidade, categoria, observacao });
  }
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const materiaisService = {
  /**
   * Gera lista completa de materiais para o projeto
   */
  gerarListaMateriais(
    postes: PosteComEquipamentos[],
    condutores: CondutorGerado[],
    barreiras: RelatorioBarreiras,
    config: ConfigProjeto
  ): ListaMateriais {
    console.log(`[MATERIAIS] Gerando lista de materiais para ${postes.length} postes e ${condutores.length} condutores...`);

    const itens: ItemMaterial[] = [];
    let totalTrafos = 0;
    let totalChaves = 0;
    let totalAterramentos = 0;

    // 1. Materiais de cada poste
    for (const poste of postes) {
      if (poste.tipo === 'existente') continue; // pular postes existentes

      const materiaisPoste = this.materiaisPoste(poste, config);
      for (const item of materiaisPoste) {
        adicionarItem(itens, item.codigo, item.descricao, item.unidade, item.quantidade, item.categoria, item.observacao);
      }

      // Contar equipamentos
      if (poste.trafo_kva) totalTrafos++;
      if (poste.chave_fusivel || poste.chave_faca) totalChaves++;
      if (poste.aterramento) totalAterramentos++;
    }

    // 2. Materiais de condutores
    let totalMetrosMT = 0;
    let totalMetrosBT = 0;

    for (const condutor of condutores) {
      const materiaisCondutor = this.materiaisCondutor(condutor, config);
      for (const item of materiaisCondutor) {
        adicionarItem(itens, item.codigo, item.descricao, item.unidade, item.quantidade, item.categoria, item.observacao);
      }

      if (condutor.tipo_rede === 'MT') {
        totalMetrosMT += condutor.comprimento_metros;
      } else {
        totalMetrosBT += condutor.comprimento_metros;
      }
    }

    // 3. Ordenar itens por categoria e código
    itens.sort((a, b) => {
      if (a.categoria !== b.categoria) {
        return a.categoria.localeCompare(b.categoria);
      }
      return a.codigo.localeCompare(b.codigo);
    });

    // 4. Resumo
    const totalPostesNovos = postes.filter(p => p.tipo !== 'existente').length;

    console.log(`[MATERIAIS] Lista gerada: ${itens.length} itens distintos`);
    console.log(`[MATERIAIS] Resumo: ${totalPostesNovos} postes, ${totalMetrosMT.toFixed(0)}m MT, ${totalMetrosBT.toFixed(0)}m BT`);

    return {
      itens,
      resumo: {
        total_postes: totalPostesNovos,
        total_metros_mt: Math.round(totalMetrosMT),
        total_metros_bt: Math.round(totalMetrosBT),
        total_trafos: totalTrafos,
        total_chaves: totalChaves,
        total_aterramentos: totalAterramentos,
        total_itens: itens.length,
      },
    };
  },

  /**
   * Gera lista de materiais para um poste específico
   */
  materiaisPoste(poste: PosteComEquipamentos, config: ConfigProjeto): ItemMaterial[] {
    const itens: ItemMaterial[] = [];

    // 1. Poste
    const codigoPoste = obterCodigoPoste(poste.altura, poste.resistencia);
    const catalogoPoste = CATALOGO_MATERIAIS.postes[codigoPoste as keyof typeof CATALOGO_MATERIAIS.postes];
    if (catalogoPoste) {
      itens.push({
        codigo: catalogoPoste.codigo,
        descricao: catalogoPoste.descricao,
        unidade: 'UN',
        quantidade: 1,
        categoria: 'POSTE',
      });
    }

    // 2. Cruzeta MT (se não for só BT)
    if (config.tipoRede === 'CONVENCIONAL') {
      itens.push({
        codigo: CATALOGO_MATERIAIS.cruzetas.CRUZETA_MT_2400.codigo,
        descricao: CATALOGO_MATERIAIS.cruzetas.CRUZETA_MT_2400.descricao,
        unidade: 'UN',
        quantidade: 1,
        categoria: 'ESTRUTURA',
      });

      // Mão francesa para MT
      itens.push({
        codigo: CATALOGO_MATERIAIS.cruzetas.MAO_FRANCESA.codigo,
        descricao: CATALOGO_MATERIAIS.cruzetas.MAO_FRANCESA.descricao,
        unidade: 'UN',
        quantidade: 2,
        categoria: 'ESTRUTURA',
      });
    }

    // 3. Suporte BT (se tiver BT)
    if (config.comBT) {
      itens.push({
        codigo: CATALOGO_MATERIAIS.cruzetas.SUPORTE_SI.codigo,
        descricao: CATALOGO_MATERIAIS.cruzetas.SUPORTE_SI.descricao,
        unidade: 'UN',
        quantidade: 1,
        categoria: 'ESTRUTURA',
      });
    }

    // 4. Isoladores (baseado na função do poste)
    const numCondutores = calcularNumCondutores(config.natureza);
    if (config.tipoRede === 'CONVENCIONAL') {
      const codigoIsolador = poste.funcao === 'TANGENTE'
        ? obterCodigoIsoladorPino(config.tensaoMT)
        : obterCodigoIsoladorAncoragem(config.tensaoMT);

      const catalogoIsolador = poste.funcao === 'TANGENTE'
        ? CATALOGO_MATERIAIS.isoladores[codigoIsolador as keyof typeof CATALOGO_MATERIAIS.isoladores]
        : CATALOGO_MATERIAIS.isoladores[codigoIsolador as keyof typeof CATALOGO_MATERIAIS.isoladores];

      if (catalogoIsolador) {
        itens.push({
          codigo: catalogoIsolador.codigo,
          descricao: catalogoIsolador.descricao,
          unidade: 'UN',
          quantidade: numCondutores,
          categoria: 'ESTRUTURA',
        });
      }
    } else {
      // Rede compacta - espaçador losangular
      itens.push({
        codigo: CATALOGO_MATERIAIS.isoladores.ESPACADOR_LOSANGULAR.codigo,
        descricao: CATALOGO_MATERIAIS.isoladores.ESPACADOR_LOSANGULAR.descricao,
        unidade: 'UN',
        quantidade: 1,
        categoria: 'ESTRUTURA',
      });
    }

    // 5. Ferragens básicas
    itens.push({
      codigo: CATALOGO_MATERIAIS.ferragens.PARAFUSO_MAQUINA.codigo,
      descricao: CATALOGO_MATERIAIS.ferragens.PARAFUSO_MAQUINA.descricao,
      unidade: 'UN',
      quantidade: 4,
      categoria: 'FERRAGEM',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.ferragens.ARRUELA_QUADRADA.codigo,
      descricao: CATALOGO_MATERIAIS.ferragens.ARRUELA_QUADRADA.descricao,
      unidade: 'UN',
      quantidade: 8,
      categoria: 'FERRAGEM',
    });

    // 6. Equipamentos especiais
    // Transformador
    if (poste.trafo_kva) {
      const materiaisTrafo = this.materiaisTrafo(poste.trafo_kva, config);
      itens.push(...materiaisTrafo);
    }

    // Chave fusível
    if (poste.chave_fusivel) {
      const codigoChave = obterCodigoChaveFusivel(config.tensaoMT);
      const catalogoChave = CATALOGO_MATERIAIS.equipamentos[codigoChave as keyof typeof CATALOGO_MATERIAIS.equipamentos];
      if (catalogoChave) {
        itens.push({
          codigo: catalogoChave.codigo,
          descricao: catalogoChave.descricao,
          unidade: 'UN',
          quantidade: numCondutores, // uma por fase
          categoria: 'EQUIPAMENTO',
        });
      }
    }

    // Chave faca
    if (poste.chave_faca) {
      const codigoChaveFaca = obterCodigoChaveFaca(config.tensaoMT);
      const catalogoChaveFaca = CATALOGO_MATERIAIS.equipamentos[codigoChaveFaca as keyof typeof CATALOGO_MATERIAIS.equipamentos];
      if (catalogoChaveFaca) {
        itens.push({
          codigo: catalogoChaveFaca.codigo,
          descricao: catalogoChaveFaca.descricao,
          unidade: 'UN',
          quantidade: numCondutores,
          categoria: 'EQUIPAMENTO',
        });
      }
    }

    // Para-raios
    if (poste.para_raios) {
      const materiaisParaRaios = this.materiaisProtecao(poste, config);
      itens.push(...materiaisParaRaios);
    }

    // 7. Estais
    if (poste.estai) {
      const materiaisEstai = this.materiaisEstai();
      itens.push(...materiaisEstai);
    }

    // 8. Aterramento
    if (poste.aterramento) {
      const materiaisAterramento = this.materiaisAterramento(config);
      itens.push(...materiaisAterramento);
    }

    return itens;
  },

  /**
   * Gera lista de materiais para um condutor
   */
  materiaisCondutor(condutor: CondutorGerado, config: ConfigProjeto): ItemMaterial[] {
    const itens: ItemMaterial[] = [];
    const numCondutores = calcularNumCondutores(config.natureza);

    // Comprimento com 5% de margem para flecha
    const comprimentoTotal = condutor.comprimento_metros * 1.05;

    if (condutor.tipo_rede === 'MT') {
      const codigoCabo = obterCodigoCondutorMT(config.condutorMT);
      const catalogoCabo = CATALOGO_MATERIAIS.condutores_mt[codigoCabo as keyof typeof CATALOGO_MATERIAIS.condutores_mt];
      if (catalogoCabo) {
        itens.push({
          codigo: catalogoCabo.codigo,
          descricao: catalogoCabo.descricao,
          unidade: 'M',
          quantidade: Math.ceil(comprimentoTotal * numCondutores),
          categoria: 'CONDUTOR',
        });
      }

      // Grampo paralelo para cada conexão
      itens.push({
        codigo: CATALOGO_MATERIAIS.ferragens.GRAMPO_PARALELO.codigo,
        descricao: CATALOGO_MATERIAIS.ferragens.GRAMPO_PARALELO.descricao,
        unidade: 'UN',
        quantidade: numCondutores * 2, // 2 por vão (entrada e saída)
        categoria: 'FERRAGEM',
      });
    } else {
      // BT Multiplex
      const codigoCabo = obterCodigoCondutorBT(config.condutorBT);
      const catalogoCabo = CATALOGO_MATERIAIS.condutores_bt[codigoCabo as keyof typeof CATALOGO_MATERIAIS.condutores_bt];
      if (catalogoCabo) {
        itens.push({
          codigo: catalogoCabo.codigo,
          descricao: catalogoCabo.descricao,
          unidade: 'M',
          quantidade: Math.ceil(comprimentoTotal),
          categoria: 'CONDUTOR',
        });
      }

      // Conector perfuração para BT multiplex
      itens.push({
        codigo: CATALOGO_MATERIAIS.ferragens.CONECTOR_PERFURACAO.codigo,
        descricao: CATALOGO_MATERIAIS.ferragens.CONECTOR_PERFURACAO.descricao,
        unidade: 'UN',
        quantidade: numCondutores + 1, // fases + neutro
        categoria: 'FERRAGEM',
      });
    }

    return itens;
  },

  /**
   * Gera materiais de aterramento
   */
  materiaisAterramento(config: ConfigProjeto): ItemMaterial[] {
    const itens: ItemMaterial[] = [];

    itens.push({
      codigo: CATALOGO_MATERIAIS.aterramento.HASTE_COPPERWELD.codigo,
      descricao: CATALOGO_MATERIAIS.aterramento.HASTE_COPPERWELD.descricao,
      unidade: 'UN',
      quantidade: 1,
      categoria: 'ATERRAMENTO',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.aterramento.CORDOALHA_COBRE.codigo,
      descricao: CATALOGO_MATERIAIS.aterramento.CORDOALHA_COBRE.descricao,
      unidade: 'M',
      quantidade: 15, // ~15m por descida
      categoria: 'ATERRAMENTO',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.aterramento.CONECTOR_HASTE.codigo,
      descricao: CATALOGO_MATERIAIS.aterramento.CONECTOR_HASTE.descricao,
      unidade: 'UN',
      quantidade: 1,
      categoria: 'ATERRAMENTO',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.aterramento.CONECTOR_SPLIT_BOLT.codigo,
      descricao: CATALOGO_MATERIAIS.aterramento.CONECTOR_SPLIT_BOLT.descricao,
      unidade: 'UN',
      quantidade: 2,
      categoria: 'ATERRAMENTO',
    });

    return itens;
  },

  /**
   * Gera materiais de proteção (para-raios)
   */
  materiaisProtecao(poste: PosteComEquipamentos, config: ConfigProjeto): ItemMaterial[] {
    const itens: ItemMaterial[] = [];
    const numCondutores = calcularNumCondutores(config.natureza);

    const codigoParaRaios = obterCodigoParaRaios(config.tensaoMT);
    const catalogoParaRaios = CATALOGO_MATERIAIS.equipamentos[codigoParaRaios as keyof typeof CATALOGO_MATERIAIS.equipamentos];

    if (catalogoParaRaios) {
      itens.push({
        codigo: catalogoParaRaios.codigo,
        descricao: catalogoParaRaios.descricao,
        unidade: 'UN',
        quantidade: numCondutores, // um por fase
        categoria: 'EQUIPAMENTO',
      });
    }

    // Cordoalha de descida do para-raios
    itens.push({
      codigo: CATALOGO_MATERIAIS.aterramento.CORDOALHA_COBRE.codigo,
      descricao: CATALOGO_MATERIAIS.aterramento.CORDOALHA_COBRE.descricao,
      unidade: 'M',
      quantidade: poste.altura + 2, // altura do poste + margem
      categoria: 'ATERRAMENTO',
    });

    return itens;
  },

  /**
   * Gera materiais do transformador
   */
  materiaisTrafo(kva: number, config: ConfigProjeto): ItemMaterial[] {
    const itens: ItemMaterial[] = [];
    const numCondutores = calcularNumCondutores(config.natureza);

    // Transformador
    const codigoTrafo = obterCodigoTrafo(kva, config.natureza);
    const catalogoTrafo = CATALOGO_MATERIAIS.equipamentos[codigoTrafo as keyof typeof CATALOGO_MATERIAIS.equipamentos];
    if (catalogoTrafo) {
      itens.push({
        codigo: catalogoTrafo.codigo,
        descricao: catalogoTrafo.descricao,
        unidade: 'UN',
        quantidade: 1,
        categoria: 'EQUIPAMENTO',
      });
    }

    // Chave fusível para trafo
    const codigoChave = obterCodigoChaveFusivel(config.tensaoMT);
    const catalogoChave = CATALOGO_MATERIAIS.equipamentos[codigoChave as keyof typeof CATALOGO_MATERIAIS.equipamentos];
    if (catalogoChave) {
      itens.push({
        codigo: catalogoChave.codigo,
        descricao: catalogoChave.descricao,
        unidade: 'UN',
        quantidade: numCondutores,
        categoria: 'EQUIPAMENTO',
      });
    }

    // Elo fusível
    const codigoElo = obterEloFusivel(kva);
    const catalogoElo = CATALOGO_MATERIAIS.equipamentos[codigoElo as keyof typeof CATALOGO_MATERIAIS.equipamentos];
    if (catalogoElo) {
      itens.push({
        codigo: catalogoElo.codigo,
        descricao: catalogoElo.descricao,
        unidade: 'UN',
        quantidade: numCondutores,
        categoria: 'EQUIPAMENTO',
      });
    }

    // Para-raios de proteção do trafo
    const codigoParaRaios = obterCodigoParaRaios(config.tensaoMT);
    const catalogoParaRaios = CATALOGO_MATERIAIS.equipamentos[codigoParaRaios as keyof typeof CATALOGO_MATERIAIS.equipamentos];
    if (catalogoParaRaios) {
      itens.push({
        codigo: catalogoParaRaios.codigo,
        descricao: catalogoParaRaios.descricao,
        unidade: 'UN',
        quantidade: numCondutores,
        categoria: 'EQUIPAMENTO',
      });
    }

    // Estribo de saída
    itens.push({
      codigo: CATALOGO_MATERIAIS.ferragens.ESTRIBO_SAIDA.codigo,
      descricao: CATALOGO_MATERIAIS.ferragens.ESTRIBO_SAIDA.descricao,
      unidade: 'UN',
      quantidade: 2,
      categoria: 'FERRAGEM',
    });

    return itens;
  },

  /**
   * Gera materiais de estai
   */
  materiaisEstai(): ItemMaterial[] {
    const itens: ItemMaterial[] = [];

    itens.push({
      codigo: CATALOGO_MATERIAIS.estais.CORDOALHA_ACO.codigo,
      descricao: CATALOGO_MATERIAIS.estais.CORDOALHA_ACO.descricao,
      unidade: 'M',
      quantidade: 15, // ~15m por estai
      categoria: 'FERRAGEM',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.estais.ANCORA_ANCORA.codigo,
      descricao: CATALOGO_MATERIAIS.estais.ANCORA_ANCORA.descricao,
      unidade: 'UN',
      quantidade: 1,
      categoria: 'FERRAGEM',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.estais.PRESILHA_ESTAI.codigo,
      descricao: CATALOGO_MATERIAIS.estais.PRESILHA_ESTAI.descricao,
      unidade: 'UN',
      quantidade: 3,
      categoria: 'FERRAGEM',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.estais.ISOLADOR_ESTAI.codigo,
      descricao: CATALOGO_MATERIAIS.estais.ISOLADOR_ESTAI.descricao,
      unidade: 'UN',
      quantidade: 1,
      categoria: 'FERRAGEM',
    });

    itens.push({
      codigo: CATALOGO_MATERIAIS.estais.PARAFUSO_ESTAI.codigo,
      descricao: CATALOGO_MATERIAIS.estais.PARAFUSO_ESTAI.descricao,
      unidade: 'UN',
      quantidade: 1,
      categoria: 'FERRAGEM',
    });

    return itens;
  },

  /**
   * Exporta o catálogo de materiais para referência
   */
  getCatalogo(): typeof CATALOGO_MATERIAIS {
    return CATALOGO_MATERIAIS;
  },

  /**
   * Calcula custo estimado da lista de materiais
   * (valores fictícios para demonstração)
   */
  calcularCustoEstimado(lista: ListaMateriais): number {
    // Preços médios de referência (R$) - valores ilustrativos
    const precosReferencia: Record<string, number> = {
      'PT-': 1200,   // postes ~R$1200
      'CR-': 150,    // cruzetas ~R$150
      'CB-': 8,      // cabos ~R$8/m
      'IS-': 45,     // isoladores ~R$45
      'FE-': 15,     // ferragens ~R$15
      'TR-': 8000,   // trafos ~R$8000
      'CH-': 350,    // chaves ~R$350
      'PR-': 180,    // para-raios ~R$180
      'AT-': 80,     // aterramento ~R$80
      'ES-': 50,     // estais ~R$50
    };

    let custoTotal = 0;

    for (const item of lista.itens) {
      const prefixo = item.codigo.substring(0, 3);
      const precoUnitario = precosReferencia[prefixo] || 50;
      custoTotal += precoUnitario * item.quantidade;
    }

    return custoTotal;
  },
};

export default materiaisService;
