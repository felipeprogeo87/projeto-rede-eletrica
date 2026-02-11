// =============================================================================
// Serviço: Regras Equatorial Energia (Normas Técnicas EQTL)
// =============================================================================
//
// Motor de regras completo para projetos elétricos de distribuição.
// Baseado nas Normas Técnicas da Equatorial Energia.
//
// Referências:
// - NT.00005.EQTL — Critérios de Projetos de Rede de Distribuição
// - NT.00006.EQTL — Padrão de Estruturas 13,8 kV e BT
// - NT.00007.EQTL — Equipamentos Especiais (Religadores, Reguladores, Capacitores)
// - NT.00008.EQTL — Padronização de Materiais por Tipo de Ambiente (Corrosividade)
// - NT.00018.EQTL — Rede de Distribuição Compacta
// - NT.00022.EQTL — Padrão de Estruturas 23,1 e 34,5 kV
// - NT.00047.EQTL — Critérios e Padronização de Aterramento
//
// =============================================================================

// -----------------------------------------------------------------------------
// Tipos e Interfaces
// -----------------------------------------------------------------------------

export type Distribuidora = 'EQUATORIAL';
export type TipoArea = 'URBANA' | 'RURAL';
export type ZonaCorrosao = 'NORMAL' | 'P1' | 'P2';
export type TipoRede = 'COMPACTA' | 'CONVENCIONAL';
export type NaturezaRede = 'MONOFASICA' | 'BIFASICA' | 'TRIFASICA';
export type FuncaoPoste = 'TANGENTE' | 'ANGULO' | 'DERIVACAO' | 'FIM' | 'ANCORAGEM' | 'EQUIPAMENTO';
export type TipoLocal = 'RUA' | 'AVENIDA' | 'RODOVIA_ESTADUAL' | 'RODOVIA_FEDERAL' | 'FERROVIA' | 'FERROVIA_ELETRIFICADA';

export interface ConfigProjeto {
  distribuidora: Distribuidora;
  estado: string;           // 'MA', 'PI', 'PA', 'AL', 'AM', 'RS'
  tipoArea: TipoArea;
  zonaCorrosao: ZonaCorrosao;
  tipoRede: TipoRede;
  natureza: NaturezaRede;
  tensaoMT: number;         // 13.8, 23.1, 34.5 kV
  tensaoBT: number;         // 220, 380 V
  condutorMT: string;       // '1/0 AWG', '4/0 AWG', '50mm²', etc.
  condutorBT: string;       // '35(35)', '70(70)', '120(70)', etc.
  comBT: boolean;           // se tem rede BT conjugada
}

export interface DimensionamentoPoste {
  altura: number;           // metros
  resistencia: number;      // daN
  tipo: string;             // 'DT' (Duplo T), 'PQDA' (Quadrado A)
  classe: string;           // 'II', 'IV' (classe de concreto)
  engastamento: 'SIMPLES' | 'CONCRETADO';
  anotacao: string;         // ex: "DT 11/300"
}

export interface EspecificacaoCondutor {
  mt: string;               // especificação MT
  bt: string;               // especificação BT
  anotacao_mt: string;      // ex: "ABC 3 #1/0 AWG CAA"
  anotacao_bt: string;      // ex: "ABCN 4 #35(35) MULT"
}

export interface ValidacaoItem {
  campo: string;
  valor: any;
  esperado: any;
  valido: boolean;
  mensagem: string;
  severidade: 'ERRO' | 'AVISO' | 'INFO';
}

export interface ValidacaoProjeto {
  valido: boolean;
  erros: ValidacaoItem[];
  avisos: ValidacaoItem[];
  infos: ValidacaoItem[];
}

// -----------------------------------------------------------------------------
// Constantes NT.00005.EQTL - Vãos (CORRIGIDO!)
// -----------------------------------------------------------------------------

/**
 * Vãos máximos em metros por configuração
 * CORREÇÃO: Valores ajustados para área RURAL conforme NT EQTL
 */
export const VAOS_MAXIMOS = {
  // MT Convencional (sem BT)
  mt_convencional_rural: 120,   // CORRIGIDO: era 80
  mt_convencional_urbano: 80,   // CORRIGIDO: era 60

  // MT Compacta (sem BT)
  mt_compacta_urbano: 60,
  mt_compacta_rural: 80,        // CORRIGIDO: era 60

  // MT + BT Conjugada (NOVO: diferenciado por área)
  mt_bt_conjugada_urbano: 45,   // NOVO
  mt_bt_conjugada_rural: 80,    // NOVO: antes era 40 fixo!
  mt_bt_conjugada: 40,          // Mantido para travessias

  // BT Exclusiva
  bt_multiplexada: 40,
  bt_convencional: 40,

  // Monofásico Rural (tipo U)
  monofasico_rural: 150,        // CORRIGIDO: era 100

  // Travessias (qualquer tipo)
  travessia: 40,
} as const;

/**
 * Vãos mínimos em metros
 */
export const VAOS_MINIMOS = {
  urbano: 30,
  rural: 40,
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00006.EQTL - Postes
// -----------------------------------------------------------------------------

/**
 * Alturas mínimas de postes em metros
 */
export const ALTURAS_POSTES = {
  bt_exclusiva_urbana: 10,
  mt_compacta: 11,
  mt_conjugada: 11,
  mt_convencional: 11,
  rural_qualquer: 11,
  com_transformador: 12,
  com_religador: 12,
  com_regulador: 12,
} as const;

/**
 * Resistência mínima de postes em daN
 */
export const RESISTENCIAS_POSTES = {
  normal_alinhamento: 300,
  fim_linha_mono: 300,
  fim_linha_tri: 600,
  derivacao_mono: 300,
  derivacao_tri: 600,
  ancoragem: 600,
  condutor_pesado: 600,     // 4/0 AWG ou 185mm²
  trafo_ate_112kva: 600,
  trafo_150kva: 1000,
  trafo_225kva_mais: 1500,
  religador: 600,
  regulador: 600,
} as const;

/**
 * Condutores que exigem poste reforçado
 */
export const CONDUTORES_PESADOS = [
  '4/0 AWG',
  '4/0AWG',
  '336,4 MCM',
  '336.4 MCM',
  '185mm²',
  '185 mm²',
];

// -----------------------------------------------------------------------------
// Constantes NT.00006.EQTL - Estruturas
// -----------------------------------------------------------------------------

/**
 * Famílias de estruturas MT
 */
export const ESTRUTURAS_MT = {
  // Monofásica Rural (tipo U)
  U: {
    tangente: 'U1',
    angulo: 'U2',
    derivacao: 'U3',
    fim: 'U3',
    angulo_seccionamento: 'U4',
  },
  // Trifásica Normal (tipo N)
  N: {
    tangente: 'N1',
    angulo: 'N2',
    derivacao: 'N3',
    fim: 'N3',
    angulo_seccionamento: 'N4',
  },
  // Trifásica Triangular (tipo T)
  T: {
    tangente: 'T1',
    angulo: 'T2',
    derivacao: 'T3',
    fim: 'T3',
    angulo_seccionamento: 'T4',
  },
  // Compacta Urbana (tipo CE)
  CE: {
    tangente: 'CE1',
    angulo: 'CE1',  // CE não tem estrutura específica para ângulo pequeno
    derivacao: 'CE3',
    fim: 'CE3',
    ancoragem: 'CE3',
  },
} as const;

/**
 * Estruturas BT Multiplexada (tipo SI)
 */
export const ESTRUTURAS_BT = {
  SI: {
    tangente: 'SI1',
    derivacao: 'SI3',
    fim: 'SI4',
    lado_oposto: 'SI4',
  },
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00005.EQTL - Alturas Mínimas ao Solo (Travessias)
// -----------------------------------------------------------------------------

export const ALTURAS_MINIMAS_TRAVESSIA = {
  rua_avenida: { bt: 5.5, mt: 6.0 },
  rodovia_estadual: { bt: 7.0, mt: 7.0 },
  rodovia_federal: { bt: 7.0, mt: 7.0 },
  ferrovia: { bt: 6.0, mt: 9.0 },
  ferrovia_eletrificada: { bt: null, mt: 12.0 },  // BT não permitida
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00008.EQTL - Corrosividade
// -----------------------------------------------------------------------------

export const ZONAS_CORROSAO = {
  NORMAL: {
    distancia_mar: '>1.5km',
    condutor: ['CAA'],
    poste_classe: ['II'],
    poste_material: ['concreto', 'madeira'],
  },
  P1: {
    distancia_mar: '0.5-1.5km',
    condutor: ['CA', 'CAL'],
    condutor_minimo: '1/0 AWG',
    poste_classe: ['II', 'IV'],
    poste_material: ['concreto'],
  },
  P2: {
    distancia_mar: '<0.5km',
    condutor: ['CA', 'CAL'],
    condutor_minimo: '1/0 AWG',
    poste_classe: ['IV'],
    poste_material: ['concreto', 'fibra_vidro'],
    bucha_minima: '25kV',
  },
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00006.EQTL - Condutores
// -----------------------------------------------------------------------------

export const CONDUTORES_MT = {
  rural_monofasico: ['2 AWG', '1/0 AWG', '4/0 AWG'],
  rural_trifasico: ['1/0 AWG', '4/0 AWG', '336,4 MCM'],
  urbano_compacto: ['50mm²', '70mm²', '120mm²', '185mm²'],
} as const;

export const CONDUTORES_BT = {
  multiplexado: ['35(35)', '70(70)', '120(70)'],
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00047.EQTL - Aterramento
// -----------------------------------------------------------------------------

export const REGRAS_ATERRAMENTO = {
  intervalo_maximo_bt: 200,    // metros
  intervalo_recomendado_bt: 150, // metros
  cercas_paralelas_intervalo: 250, // metros (cercas ≤30m da rede)
  distancia_maxima_cerca: 30,  // metros
} as const;

// -----------------------------------------------------------------------------
// Constantes NT.00005.EQTL - Proteção
// -----------------------------------------------------------------------------

export const REGRAS_PROTECAO = {
  pararaios: {
    intervalo_rural_km: 5,
    obrigatorio_em: ['trafo', 'religador', 'regulador', 'fim_rede', 'transicao_urbano_rural'],
  },
  chave_fusivel: {
    obrigatorio_em: ['derivacao_tronco', 'trafo', 'entrada_loteamento'],
  },
  chave_seccionadora: {
    intervalo_km: 5,
    obrigatorio_em: ['transicao_urbano_rural'],
  },
} as const;

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const regrasEquatorialService = {
  /**
   * Obtém o vão máximo permitido para a configuração
   * CORRIGIDO: Agora considera tipo de área mesmo com BT conjugada
   */
  obterVaoMaximo(
    config: ConfigProjeto,
    travessia: boolean = false,
    anguloGraus: number = 0
  ): number {
    // Travessias sempre limitam a 40m
    if (travessia) {
      return VAOS_MAXIMOS.travessia;
    }

    // Ângulos acentuados (>60°) também limitam
    if (anguloGraus > 60) {
      return VAOS_MAXIMOS.travessia;
    }

    // Monofásico rural tipo U pode ter vãos maiores
    if (config.natureza === 'MONOFASICA' && config.tipoArea === 'RURAL' && config.tipoRede === 'CONVENCIONAL') {
      return VAOS_MAXIMOS.monofasico_rural;
    }

    // CORRIGIDO: Com BT conjugada, agora considera tipo de área
    if (config.comBT) {
      return config.tipoArea === 'RURAL' 
        ? VAOS_MAXIMOS.mt_bt_conjugada_rural   // 80m
        : VAOS_MAXIMOS.mt_bt_conjugada_urbano; // 45m
    }

    // MT Compacta
    if (config.tipoRede === 'COMPACTA') {
      return config.tipoArea === 'RURAL'
        ? VAOS_MAXIMOS.mt_compacta_rural
        : VAOS_MAXIMOS.mt_compacta_urbano;
    }

    // MT Convencional
    if (config.tipoArea === 'RURAL') {
      return VAOS_MAXIMOS.mt_convencional_rural;
    }

    return VAOS_MAXIMOS.mt_convencional_urbano;
  },

  /**
   * Obtém o vão mínimo permitido
   */
  obterVaoMinimo(config: ConfigProjeto): number {
    return config.tipoArea === 'URBANA' ? VAOS_MINIMOS.urbano : VAOS_MINIMOS.rural;
  },

  /**
   * Seleciona a estrutura adequada para o poste
   */
  selecionarEstrutura(
    config: ConfigProjeto,
    funcao: FuncaoPoste,
    anguloGraus: number = 0,
    comSeccionamento: boolean = false
  ): string {
    // Determinar família de estrutura
    let familia: 'U' | 'N' | 'T' | 'CE';

    if (config.tipoRede === 'COMPACTA') {
      familia = 'CE';
    } else if (config.natureza === 'MONOFASICA') {
      familia = 'U';
    } else {
      // Trifásica: N (normal) ou T (triangular)
      // Para simplificar, usamos N como padrão
      familia = 'N';
    }

    const estruturas = ESTRUTURAS_MT[familia];

    // Mapear função para tipo de estrutura
    switch (funcao) {
      case 'TANGENTE':
        return estruturas.tangente;

      case 'ANGULO':
        // Ângulo com seccionamento
        if (comSeccionamento && 'angulo_seccionamento' in estruturas) {
          return estruturas.angulo_seccionamento;
        }
        return estruturas.angulo;

      case 'DERIVACAO':
        return estruturas.derivacao;

      case 'FIM':
        return estruturas.fim;

      case 'ANCORAGEM':
        return 'ancoragem' in estruturas ? estruturas.ancoragem : estruturas.fim;

      case 'EQUIPAMENTO':
        // Equipamentos geralmente usam estrutura de derivação/fim
        return estruturas.derivacao;

      default:
        return estruturas.tangente;
    }
  },

  /**
   * Seleciona estrutura BT
   */
  selecionarEstruturaBT(funcao: 'TANGENTE' | 'DERIVACAO' | 'FIM'): string {
    switch (funcao) {
      case 'TANGENTE':
        return ESTRUTURAS_BT.SI.tangente;
      case 'DERIVACAO':
        return ESTRUTURAS_BT.SI.derivacao;
      case 'FIM':
        return ESTRUTURAS_BT.SI.fim;
      default:
        return ESTRUTURAS_BT.SI.tangente;
    }
  },

  /**
   * Dimensiona o poste completo
   */
  dimensionarPoste(
    config: ConfigProjeto,
    funcao: FuncaoPoste,
    opcoes: {
      trafoKVA?: number;
      condutorPesado?: boolean;
      religador?: boolean;
      regulador?: boolean;
    } = {}
  ): DimensionamentoPoste {
    let altura: number;
    let resistencia: number;
    let engastamento: 'SIMPLES' | 'CONCRETADO';
    let classe: string;

    // 1. Determinar altura mínima
    if (opcoes.trafoKVA) {
      altura = ALTURAS_POSTES.com_transformador;
    } else if (opcoes.religador || opcoes.regulador) {
      altura = ALTURAS_POSTES.com_religador;
    } else if (config.tipoRede === 'COMPACTA') {
      altura = ALTURAS_POSTES.mt_compacta;
    } else if (config.comBT) {
      altura = ALTURAS_POSTES.mt_conjugada;
    } else if (config.tipoArea === 'RURAL') {
      altura = ALTURAS_POSTES.rural_qualquer;
    } else {
      altura = ALTURAS_POSTES.mt_convencional;
    }

    // 2. Determinar resistência mínima
    resistencia = RESISTENCIAS_POSTES.normal_alinhamento;

    // Verificar condições que exigem reforço
    if (opcoes.trafoKVA) {
      if (opcoes.trafoKVA >= 225) {
        resistencia = RESISTENCIAS_POSTES.trafo_225kva_mais;
      } else if (opcoes.trafoKVA >= 150) {
        resistencia = RESISTENCIAS_POSTES.trafo_150kva;
      } else {
        resistencia = RESISTENCIAS_POSTES.trafo_ate_112kva;
      }
    } else if (opcoes.religador || opcoes.regulador) {
      resistencia = RESISTENCIAS_POSTES.religador;
    } else if (opcoes.condutorPesado) {
      resistencia = RESISTENCIAS_POSTES.condutor_pesado;
    } else if (funcao === 'ANCORAGEM') {
      resistencia = RESISTENCIAS_POSTES.ancoragem;
    } else if (funcao === 'FIM' || funcao === 'DERIVACAO') {
      resistencia = config.natureza === 'TRIFASICA'
        ? RESISTENCIAS_POSTES.fim_linha_tri
        : RESISTENCIAS_POSTES.fim_linha_mono;
    }

    // 3. Determinar engastamento
    engastamento = resistencia >= 600 ? 'CONCRETADO' : 'SIMPLES';

    // 4. Determinar classe do poste por zona de corrosão
    if (config.zonaCorrosao === 'P2') {
      classe = 'IV';
    } else if (config.zonaCorrosao === 'P1') {
      classe = resistencia >= 600 ? 'IV' : 'II';
    } else {
      classe = 'II';
    }

    // 5. Gerar anotação padrão Equatorial
    const anotacao = `DT ${altura}/${resistencia}`;

    return {
      altura,
      resistencia,
      tipo: 'DT',
      classe,
      engastamento,
      anotacao,
    };
  },

  /**
   * Seleciona e formata especificação do condutor
   */
  selecionarCondutor(config: ConfigProjeto): EspecificacaoCondutor {
    let mt = config.condutorMT || '1/0 AWG';
    let bt = config.condutorBT || '35(35)';

    // Ajustar para zona de corrosão
    if (config.zonaCorrosao !== 'NORMAL') {
      // Zonas P1/P2 exigem condutor mínimo 1/0 AWG
      const bitolasPermitidas = ['1/0 AWG', '4/0 AWG', '336,4 MCM'];
      if (!bitolasPermitidas.some(b => mt.includes(b.replace(' ', '')))) {
        mt = '1/0 AWG';
      }
    }

    // Gerar anotações no formato Equatorial
    let fases_mt: string;
    let n_condutores_mt: number;

    if (config.natureza === 'MONOFASICA') {
      fases_mt = 'AC';
      n_condutores_mt = 2;
    } else if (config.natureza === 'BIFASICA') {
      fases_mt = 'AB';
      n_condutores_mt = 2;
    } else {
      fases_mt = 'ABC';
      n_condutores_mt = 3;
    }

    const tipo_cabo_mt = config.tipoRede === 'COMPACTA' ? 'XLPE' : 'CAA';
    const anotacao_mt = `${fases_mt} ${n_condutores_mt} #${mt} ${tipo_cabo_mt}`;

    // BT
    let fases_bt: string;
    let n_condutores_bt: number;

    if (config.natureza === 'MONOFASICA') {
      fases_bt = 'AN';
      n_condutores_bt = 1;
    } else {
      fases_bt = 'ABCN';
      n_condutores_bt = 4;
    }

    const anotacao_bt = config.comBT ? `${fases_bt} ${n_condutores_bt} #${bt} MULT` : '';

    return {
      mt,
      bt,
      anotacao_mt,
      anotacao_bt,
    };
  },

  /**
   * Verifica altura mínima para travessia
   */
  verificarAlturaMinima(
    tipoLocal: TipoLocal,
    tensao: 'BT' | 'MT'
  ): number {
    const key = tipoLocal.toLowerCase().replace(/_/g, '_') as keyof typeof ALTURAS_MINIMAS_TRAVESSIA;

    // Mapear tipo de local para chave
    let alturasLocal: { bt: number | null; mt: number };

    switch (tipoLocal) {
      case 'RUA':
      case 'AVENIDA':
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.rua_avenida;
        break;
      case 'RODOVIA_ESTADUAL':
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.rodovia_estadual;
        break;
      case 'RODOVIA_FEDERAL':
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.rodovia_federal;
        break;
      case 'FERROVIA':
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.ferrovia;
        break;
      case 'FERROVIA_ELETRIFICADA':
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.ferrovia_eletrificada;
        break;
      default:
        alturasLocal = ALTURAS_MINIMAS_TRAVESSIA.rua_avenida;
    }

    if (tensao === 'BT') {
      return alturasLocal.bt ?? 0;
    }
    return alturasLocal.mt;
  },

  /**
   * Verifica se precisa de aterramento
   */
  verificarAterramento(distanciaUltimoAterramentoMetros: number): boolean {
    return distanciaUltimoAterramentoMetros >= REGRAS_ATERRAMENTO.intervalo_recomendado_bt;
  },

  /**
   * Verifica se aterramento é obrigatório (limite máximo)
   */
  aterramentoObrigatorio(distanciaUltimoAterramentoMetros: number): boolean {
    return distanciaUltimoAterramentoMetros >= REGRAS_ATERRAMENTO.intervalo_maximo_bt;
  },

  /**
   * Seleciona material adequado para zona de corrosão
   */
  selecionarMaterialCorrosao(
    config: ConfigProjeto,
    componente: 'CONDUTOR' | 'POSTE' | 'FERRAGEM' | 'ISOLADOR'
  ): { material: string; especificacao: string } {
    const zona = ZONAS_CORROSAO[config.zonaCorrosao];

    switch (componente) {
      case 'CONDUTOR':
        return {
          material: zona.condutor[0],
          especificacao: 'condutor_minimo' in zona ? `Mínimo ${zona.condutor_minimo}` : 'Padrão',
        };

      case 'POSTE':
        return {
          material: zona.poste_material[0],
          especificacao: `Classe ${zona.poste_classe[0]}`,
        };

      case 'FERRAGEM':
        if (config.zonaCorrosao === 'P2') {
          return { material: 'Aço inox ou galvanizado a fogo', especificacao: 'Zona P2' };
        } else if (config.zonaCorrosao === 'P1') {
          return { material: 'Galvanizado a fogo', especificacao: 'Zona P1' };
        }
        return { material: 'Galvanizado', especificacao: 'Normal' };

      case 'ISOLADOR':
        if (config.zonaCorrosao === 'P2') {
          return { material: 'Polimérico ou porcelana vidrada', especificacao: 'Bucha mín 25kV' };
        }
        return { material: 'Porcelana ou polimérico', especificacao: 'Padrão' };

      default:
        return { material: 'Padrão', especificacao: 'Normal' };
    }
  },

  /**
   * Verifica se condutor é pesado (exige poste reforçado)
   */
  condutorPesado(condutor: string): boolean {
    return CONDUTORES_PESADOS.some(cp =>
      condutor.toUpperCase().includes(cp.toUpperCase().replace(' ', ''))
    );
  },

  /**
   * Calcula função do poste baseado no ângulo e posição
   */
  calcularFuncaoPoste(
    anguloGraus: number,
    ehFimDeLinha: boolean,
    ehDerivacao: boolean,
    temEquipamento: boolean
  ): FuncaoPoste {
    if (temEquipamento) return 'EQUIPAMENTO';
    if (ehFimDeLinha) return 'FIM';
    if (ehDerivacao) return 'DERIVACAO';
    if (anguloGraus > 60) return 'ANCORAGEM';
    if (anguloGraus > 30) return 'ANGULO';
    return 'TANGENTE';
  },

  /**
   * Valida um projeto completo
   */
  validarProjeto(
    postes: Array<{
      id: string;
      altura: number;
      resistencia: number;
      estrutura: string;
      aterramento?: boolean;
    }>,
    condutores: Array<{
      id: string;
      comprimento: number;
      poste_origem_id: string;
      poste_destino_id: string;
    }>,
    config: ConfigProjeto
  ): ValidacaoProjeto {
    const erros: ValidacaoItem[] = [];
    const avisos: ValidacaoItem[] = [];
    const infos: ValidacaoItem[] = [];

    const vaoMaximo = this.obterVaoMaximo(config, false, 0);
    const vaoMinimo = this.obterVaoMinimo(config);

    // Validar condutores (vãos)
    for (const condutor of condutores) {
      // Vão máximo
      if (condutor.comprimento > vaoMaximo) {
        erros.push({
          campo: `condutor.${condutor.id}.comprimento`,
          valor: condutor.comprimento,
          esperado: `<= ${vaoMaximo}`,
          valido: false,
          mensagem: `Vão de ${condutor.comprimento.toFixed(1)}m excede máximo de ${vaoMaximo}m`,
          severidade: 'ERRO',
        });
      }

      // Vão mínimo
      if (condutor.comprimento < vaoMinimo) {
        avisos.push({
          campo: `condutor.${condutor.id}.comprimento`,
          valor: condutor.comprimento,
          esperado: `>= ${vaoMinimo}`,
          valido: false,
          mensagem: `Vão de ${condutor.comprimento.toFixed(1)}m abaixo do mínimo de ${vaoMinimo}m`,
          severidade: 'AVISO',
        });
      }
    }

    // Validar postes
    const alturaMinima = config.tipoRede === 'COMPACTA'
      ? ALTURAS_POSTES.mt_compacta
      : ALTURAS_POSTES.mt_convencional;

    for (const poste of postes) {
      // Altura mínima
      if (poste.altura < alturaMinima) {
        erros.push({
          campo: `poste.${poste.id}.altura`,
          valor: poste.altura,
          esperado: `>= ${alturaMinima}`,
          valido: false,
          mensagem: `Poste ${poste.id} com altura ${poste.altura}m abaixo do mínimo ${alturaMinima}m`,
          severidade: 'ERRO',
        });
      }

      // Resistência mínima
      if (poste.resistencia < RESISTENCIAS_POSTES.normal_alinhamento) {
        erros.push({
          campo: `poste.${poste.id}.resistencia`,
          valor: poste.resistencia,
          esperado: `>= ${RESISTENCIAS_POSTES.normal_alinhamento}`,
          valido: false,
          mensagem: `Poste ${poste.id} com resistência ${poste.resistencia}daN abaixo do mínimo`,
          severidade: 'ERRO',
        });
      }
    }

    // Validar aterramento (verificar espaçamento considerando postes aterrados)
    const postesMap = new Map(postes.map(p => [p.id, p]));
    let distanciaAcumulada = 0;
    // Filtrar apenas condutores MT (evitar contar o mesmo trecho 2x com BT)
    const condutoresMT = condutores.filter(c => c.id.startsWith('CMT'));
    for (const condutor of condutoresMT) {
      const posteDestino = postesMap.get(condutor.poste_destino_id);

      distanciaAcumulada += condutor.comprimento;

      // Se o poste de destino tem aterramento, resetar o contador
      if (posteDestino?.aterramento) {
        distanciaAcumulada = 0;
        continue;
      }

      if (distanciaAcumulada > REGRAS_ATERRAMENTO.intervalo_maximo_bt) {
        avisos.push({
          campo: 'aterramento',
          valor: distanciaAcumulada,
          esperado: `<= ${REGRAS_ATERRAMENTO.intervalo_maximo_bt}`,
          valido: false,
          mensagem: `Distância sem aterramento de ${distanciaAcumulada.toFixed(0)}m excede máximo`,
          severidade: 'AVISO',
        });
        distanciaAcumulada = 0; // Reset para próximo trecho
      }
    }

    // Informações gerais
    infos.push({
      campo: 'configuracao',
      valor: `${config.tipoRede} ${config.natureza} ${config.tipoArea}`,
      esperado: '-',
      valido: true,
      mensagem: `Projeto ${config.tipoRede} ${config.natureza} em área ${config.tipoArea}`,
      severidade: 'INFO',
    });

    infos.push({
      campo: 'totais',
      valor: { postes: postes.length, condutores: condutores.length },
      esperado: '-',
      valido: true,
      mensagem: `Total: ${postes.length} postes, ${condutores.length} trechos`,
      severidade: 'INFO',
    });

    infos.push({
      campo: 'vaos',
      valor: { min: vaoMinimo, max: vaoMaximo },
      esperado: '-',
      valido: true,
      mensagem: `Vãos permitidos: ${vaoMinimo}m - ${vaoMaximo}m`,
      severidade: 'INFO',
    });

    return {
      valido: erros.length === 0,
      erros,
      avisos,
      infos,
    };
  },

  /**
   * Monta configuração padrão baseada em dados da OS
   */
  montarConfigPadrao(
    distribuidora: Distribuidora = 'EQUATORIAL',
    estado: string = 'MA',
    tipoRede: string = 'CONVENCIONAL',
    tipoArea: TipoArea = 'RURAL'
  ): ConfigProjeto {
    return {
      distribuidora,
      estado,
      tipoArea,
      zonaCorrosao: 'NORMAL',
      tipoRede: tipoRede.toUpperCase() === 'COMPACTA' ? 'COMPACTA' : 'CONVENCIONAL',
      natureza: 'TRIFASICA',
      tensaoMT: 13.8,
      tensaoBT: 380,
      condutorMT: '1/0 AWG',
      condutorBT: '35(35)',
      comBT: false,
    };
  },

  /**
   * Exporta todas as constantes para uso externo
   */
  getConstantes() {
    return {
      VAOS_MAXIMOS,
      VAOS_MINIMOS,
      ALTURAS_POSTES,
      RESISTENCIAS_POSTES,
      ESTRUTURAS_MT,
      ESTRUTURAS_BT,
      ALTURAS_MINIMAS_TRAVESSIA,
      ZONAS_CORROSAO,
      REGRAS_ATERRAMENTO,
      REGRAS_PROTECAO,
    };
  },
};

export default regrasEquatorialService;
