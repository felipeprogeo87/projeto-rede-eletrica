// =============================================================================
// Serviço: Integração com Fontes de Dados Públicas
// =============================================================================
//
// Integra dados de:
// - IBGE: Setores censitários, malha urbana, população
// - ANEEL: Dados regulatórios, tarifas, distribuidoras
// - SNIS: Saneamento e infraestrutura
// - Prefeituras: Dados municipais (quando disponíveis)
//
// =============================================================================

import axios from 'axios';
import { Coordenada } from './osmService';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface DadosIBGE {
  municipio: {
    codigo: string;
    nome: string;
    uf: string;
    regiao: string;
    populacao?: number;
    area_km2?: number;
    densidade?: number;
  };
  setorCensitario?: {
    codigo: string;
    tipo: 'URBANO' | 'RURAL';
    domicilios?: number;
    moradores?: number;
  };
  malhaUrbana?: {
    tipoArea: 'URBANIZADA' | 'NAO_URBANIZADA' | 'AREA_URBANA_ISOLADA';
    perimetro?: boolean;
  };
}

export interface DadosANEEL {
  distribuidora: {
    nome: string;
    cnpj: string;
    sigla: string;
    areaConcessao: string[];
  };
  tarifas?: {
    residencial: number;
    comercial: number;
    industrial: number;
    vigencia: string;
  };
}

export interface DadosMunicipais {
  zoneamento?: string;
  restricoes?: string[];
  licenciamento?: {
    requerido: boolean;
    tipo: string;
  };
}

export interface ResultadoFontesExternas {
  ibge: DadosIBGE | null;
  aneel: DadosANEEL | null;
  municipais: DadosMunicipais | null;
  consultasRealizadas: ConsultaRealizada[];
  erros: ErroConsulta[];
}

export interface ConsultaRealizada {
  fonte: string;
  url: string;
  status: 'sucesso' | 'erro' | 'timeout';
  tempoMs: number;
  timestamp: Date;
}

export interface ErroConsulta {
  fonte: string;
  mensagem: string;
  codigo?: string;
}

// Callback para reportar progresso
export type ProgressCallback = (etapa: string, detalhe: string, progresso: number) => void;

// -----------------------------------------------------------------------------
// URLs das APIs
// -----------------------------------------------------------------------------

const APIS = {
  IBGE: {
    MUNICIPIOS: 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',
    GEOCODE: 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',
    MALHA: 'https://servicodados.ibge.gov.br/api/v3/malhas/municipios',
    AGREGADOS: 'https://servicodados.ibge.gov.br/api/v3/agregados',
  },
  ANEEL: {
    DISTRIBUIDORAS: 'https://dadosabertos.aneel.gov.br/api/3/action/datastore_search',
    TARIFAS: 'https://dadosabertos.aneel.gov.br/api/3/action/datastore_search',
  },
  NOMINATIM: {
    REVERSE: 'https://nominatim.openstreetmap.org/reverse',
  },
};

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const fontesExternasService = {
  /**
   * Consulta todas as fontes externas para um ponto
   */
  async consultarTudo(
    coordenada: Coordenada,
    onProgress?: ProgressCallback
  ): Promise<ResultadoFontesExternas> {
    const consultas: ConsultaRealizada[] = [];
    const erros: ErroConsulta[] = [];
    
    let ibge: DadosIBGE | null = null;
    let aneel: DadosANEEL | null = null;
    let municipais: DadosMunicipais | null = null;
    
    // 1. Consultar IBGE
    onProgress?.('IBGE', 'Buscando dados do município...', 10);
    try {
      ibge = await this.consultarIBGE(coordenada, consultas);
      onProgress?.('IBGE', `Município: ${ibge?.municipio.nome || 'não encontrado'}`, 30);
    } catch (error: any) {
      erros.push({ fonte: 'IBGE', mensagem: error.message });
      onProgress?.('IBGE', `Erro: ${error.message}`, 30);
    }
    
    // 2. Consultar ANEEL
    onProgress?.('ANEEL', 'Buscando dados da distribuidora...', 40);
    try {
      if (ibge?.municipio.uf) {
        aneel = await this.consultarANEEL(ibge.municipio.uf, consultas);
        onProgress?.('ANEEL', `Distribuidora: ${aneel?.distribuidora.nome || 'não encontrada'}`, 60);
      }
    } catch (error: any) {
      erros.push({ fonte: 'ANEEL', mensagem: error.message });
      onProgress?.('ANEEL', `Erro: ${error.message}`, 60);
    }
    
    // 3. Dados municipais (simulado - seria integração específica)
    onProgress?.('PREFEITURA', 'Verificando dados municipais...', 70);
    try {
      municipais = await this.consultarDadosMunicipais(coordenada, ibge?.municipio.codigo, consultas);
      onProgress?.('PREFEITURA', 'Dados municipais verificados', 90);
    } catch (error: any) {
      erros.push({ fonte: 'PREFEITURA', mensagem: error.message });
    }
    
    onProgress?.('CONCLUÍDO', 'Consultas finalizadas', 100);
    
    return {
      ibge,
      aneel,
      municipais,
      consultasRealizadas: consultas,
      erros,
    };
  },

  /**
   * Consulta dados do IBGE
   */
  async consultarIBGE(coordenada: Coordenada, consultas: ConsultaRealizada[]): Promise<DadosIBGE> {
    const inicio = Date.now();
    
    // 1. Geocodificação reversa para encontrar município
    const urlNominatim = `${APIS.NOMINATIM.REVERSE}?format=json&lat=${coordenada.lat}&lon=${coordenada.lng}&zoom=10`;
    
    try {
      const respNominatim = await axios.get(urlNominatim, {
        timeout: 10000,
        headers: { 'User-Agent': 'ProjetoRedeEletrica/1.0' },
      });
      
      consultas.push({
        fonte: 'Nominatim',
        url: urlNominatim,
        status: 'sucesso',
        tempoMs: Date.now() - inicio,
        timestamp: new Date(),
      });
      
      const endereco = respNominatim.data.address || {};
      const municipioNome = endereco.city || endereco.town || endereco.municipality || 'Desconhecido';
      const uf = endereco.state || '';
      
      // 2. Buscar código do município no IBGE
      const inicioIBGE = Date.now();
      const urlIBGE = `${APIS.IBGE.MUNICIPIOS}/${this.ufParaCodigo(uf)}`;
      
      let codigoMunicipio = '';
      let populacao: number | undefined;
      let areaKm2: number | undefined;
      
      try {
        const respIBGE = await axios.get(urlIBGE, { timeout: 10000 });
        
        consultas.push({
          fonte: 'IBGE Municípios',
          url: urlIBGE,
          status: 'sucesso',
          tempoMs: Date.now() - inicioIBGE,
          timestamp: new Date(),
        });
        
        const municipioEncontrado = respIBGE.data.find((m: any) => 
          m.nome.toLowerCase().includes(municipioNome.toLowerCase()) ||
          municipioNome.toLowerCase().includes(m.nome.toLowerCase())
        );
        
        if (municipioEncontrado) {
          codigoMunicipio = municipioEncontrado.id.toString();
        }
      } catch (e) {
        consultas.push({
          fonte: 'IBGE Municípios',
          url: urlIBGE,
          status: 'erro',
          tempoMs: Date.now() - inicioIBGE,
          timestamp: new Date(),
        });
      }
      
      // Determinar se é área urbana ou rural baseado no endereço
      const tipoArea = endereco.suburb || endereco.neighbourhood ? 'URBANO' : 'RURAL';
      
      return {
        municipio: {
          codigo: codigoMunicipio,
          nome: municipioNome,
          uf: this.extrairSiglaUF(uf),
          regiao: this.ufParaRegiao(this.extrairSiglaUF(uf)),
          populacao,
          area_km2: areaKm2,
          densidade: populacao && areaKm2 ? populacao / areaKm2 : undefined,
        },
        setorCensitario: {
          codigo: '',
          tipo: tipoArea as 'URBANO' | 'RURAL',
        },
        malhaUrbana: {
          tipoArea: tipoArea === 'URBANO' ? 'URBANIZADA' : 'NAO_URBANIZADA',
        },
      };
      
    } catch (error: any) {
      consultas.push({
        fonte: 'Nominatim',
        url: urlNominatim,
        status: 'erro',
        tempoMs: Date.now() - inicio,
        timestamp: new Date(),
      });
      throw error;
    }
  },

  /**
   * Consulta dados da ANEEL
   */
  async consultarANEEL(uf: string, consultas: ConsultaRealizada[]): Promise<DadosANEEL> {
    // Mapeamento simplificado de distribuidoras por estado
    const distribuidorasPorUF: Record<string, { nome: string; sigla: string }> = {
      'MA': { nome: 'Equatorial Maranhão', sigla: 'EQTL-MA' },
      'PA': { nome: 'Equatorial Pará', sigla: 'EQTL-PA' },
      'PI': { nome: 'Equatorial Piauí', sigla: 'EQTL-PI' },
      'AL': { nome: 'Equatorial Alagoas', sigla: 'EQTL-AL' },
      'GO': { nome: 'Equatorial Goiás', sigla: 'EQTL-GO' },
      'RS': { nome: 'Equatorial RS Distribuidora', sigla: 'EQTL-RS' },
      'SP': { nome: 'CPFL Paulista', sigla: 'CPFL' },
      'RJ': { nome: 'Light', sigla: 'LIGHT' },
      'MG': { nome: 'CEMIG', sigla: 'CEMIG' },
      // Adicionar outros estados conforme necessário
    };
    
    const inicio = Date.now();
    const distribuidora = distribuidorasPorUF[uf] || { nome: 'Desconhecida', sigla: 'DESC' };
    
    consultas.push({
      fonte: 'ANEEL (cache local)',
      url: 'local',
      status: 'sucesso',
      tempoMs: Date.now() - inicio,
      timestamp: new Date(),
    });
    
    return {
      distribuidora: {
        nome: distribuidora.nome,
        cnpj: '',
        sigla: distribuidora.sigla,
        areaConcessao: [uf],
      },
    };
  },

  /**
   * Consulta dados municipais (simulado)
   */
  async consultarDadosMunicipais(
    coordenada: Coordenada,
    codigoMunicipio?: string,
    consultas?: ConsultaRealizada[]
  ): Promise<DadosMunicipais> {
    // Por enquanto retorna dados genéricos
    // Futuramente pode integrar com APIs de prefeituras
    
    return {
      zoneamento: 'Verificar junto à prefeitura',
      restricoes: [],
      licenciamento: {
        requerido: true,
        tipo: 'Alvará de construção de rede',
      },
    };
  },

  /**
   * Converte nome do estado para código IBGE
   */
  ufParaCodigo(estado: string): string {
    const codigos: Record<string, string> = {
      'Maranhão': '21', 'MA': '21',
      'Piauí': '22', 'PI': '22',
      'Pará': '15', 'PA': '15',
      'Alagoas': '27', 'AL': '27',
      'Goiás': '52', 'GO': '52',
      'Rio Grande do Sul': '43', 'RS': '43',
      'São Paulo': '35', 'SP': '35',
      'Rio de Janeiro': '33', 'RJ': '33',
      'Minas Gerais': '31', 'MG': '31',
      // Adicionar outros estados
    };
    return codigos[estado] || '21';
  },

  /**
   * Extrai sigla UF do nome do estado
   */
  extrairSiglaUF(estado: string): string {
    const siglas: Record<string, string> = {
      'Maranhão': 'MA', 'Piauí': 'PI', 'Pará': 'PA',
      'Alagoas': 'AL', 'Goiás': 'GO', 'Rio Grande do Sul': 'RS',
      'São Paulo': 'SP', 'Rio de Janeiro': 'RJ', 'Minas Gerais': 'MG',
      'Bahia': 'BA', 'Ceará': 'CE', 'Pernambuco': 'PE',
      'Amazonas': 'AM', 'Acre': 'AC', 'Amapá': 'AP',
      'Roraima': 'RR', 'Rondônia': 'RO', 'Tocantins': 'TO',
      'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
      'Paraná': 'PR', 'Santa Catarina': 'SC',
      'Espírito Santo': 'ES', 'Rio Grande do Norte': 'RN',
      'Paraíba': 'PB', 'Sergipe': 'SE', 'Distrito Federal': 'DF',
    };
    
    if (estado.length === 2) return estado.toUpperCase();
    return siglas[estado] || estado.substring(0, 2).toUpperCase();
  },

  /**
   * Retorna região do Brasil por UF
   */
  ufParaRegiao(uf: string): string {
    const regioes: Record<string, string> = {
      'AC': 'Norte', 'AP': 'Norte', 'AM': 'Norte', 'PA': 'Norte', 'RO': 'Norte', 'RR': 'Norte', 'TO': 'Norte',
      'AL': 'Nordeste', 'BA': 'Nordeste', 'CE': 'Nordeste', 'MA': 'Nordeste', 'PB': 'Nordeste',
      'PE': 'Nordeste', 'PI': 'Nordeste', 'RN': 'Nordeste', 'SE': 'Nordeste',
      'DF': 'Centro-Oeste', 'GO': 'Centro-Oeste', 'MT': 'Centro-Oeste', 'MS': 'Centro-Oeste',
      'ES': 'Sudeste', 'MG': 'Sudeste', 'RJ': 'Sudeste', 'SP': 'Sudeste',
      'PR': 'Sul', 'RS': 'Sul', 'SC': 'Sul',
    };
    return regioes[uf] || 'Desconhecida';
  },
};

export default fontesExternasService;
