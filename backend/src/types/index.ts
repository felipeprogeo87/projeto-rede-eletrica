// =============================================================================
// Types: Interfaces compartilhadas do sistema de geração de projetos elétricos
// =============================================================================

// =============================================================================
// COORDENADAS E GEOMETRIA
// =============================================================================

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// =============================================================================
// ELEVAÇÃO E TERRENO
// =============================================================================

export interface PontoElevacao {
  lat: number;
  lng: number;
  elevacao: number;
}

export interface PerfilAltimetrico {
  pontos: PontoElevacao[];
  elevacaoMinima: number;
  elevacaoMaxima: number;
  desnivelTotal: number;
  decliveMaximo: number;
}

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
  resolucao: number;
  bbox: BoundingBox;
  largura: number;
  altura: number;
  dados: number[][];
}

// =============================================================================
// BARREIRAS
// =============================================================================

export type TipoBarreira =
  | 'travessia_hidrica'
  | 'travessia_ferroviaria'
  | 'travessia_rodoviaria'
  | 'travessia_lt'
  | 'vegetacao'
  | 'area_alagavel'
  | 'area_app';

export type SeveridadeBarreira = 'info' | 'aviso' | 'critico';

export interface ImpactoBarreira {
  altura_minima_aumentada?: number;
  estrutura_especial?: string;
  material_especial?: string;
  requer_autorizacao?: boolean;
  observacao: string;
}

export interface Barreira {
  tipo: TipoBarreira;
  descricao: string;
  poste_antes_id: string;
  poste_depois_id: string;
  coordenada: Coordenada;
  nome?: string;
  impacto: ImpactoBarreira;
  severidade: SeveridadeBarreira;
}

export interface ResumoBarreiras {
  total: number;
  criticas: number;
  avisos: number;
  infos: number;
  travessias_hidricas: number;
  travessias_ferroviarias: number;
  travessias_rodoviarias: number;
  travessias_lt: number;
  trechos_poda: number;
  areas_alagaveis: number;
}

export interface RelatorioBarreiras {
  barreiras: Barreira[];
  resumo: ResumoBarreiras;
}

// =============================================================================
// POSTES E ESTRUTURAS
// =============================================================================

export type TipoPoste = 'novo' | 'existente';

export type FuncaoPoste =
  | 'INICIO'
  | 'FIM'
  | 'PASSAGEM'
  | 'ANCORAGEM'
  | 'DERIVACAO'
  | 'EQUIPAMENTO';

export interface PosteGerado {
  id: string;
  codigo: string;
  latitude: number;
  longitude: number;
  altura: number;
  resistencia: number;
  estrutura: string;
  tipo: TipoPoste;
  funcao: FuncaoPoste;
  trafo_kva?: number;
  chave_fusivel: boolean;
  para_raios: boolean;
  aterramento: boolean;
  estai: boolean;
}

export interface DimensionamentoPoste {
  altura: number;
  resistencia: number;
  tipo: string;
  classe: string;
  engastamento: string;
}

// =============================================================================
// CONDUTORES
// =============================================================================

export type TipoRede = 'MT' | 'BT';

export interface CondutorGerado {
  id: string;
  poste_origem_id: string;
  poste_destino_id: string;
  tipo_rede: TipoRede;
  tipo_cabo: string;
  comprimento_metros: number;
}

// =============================================================================
// MATERIAIS
// =============================================================================

export type CategoriaMaterial =
  | 'POSTE'
  | 'CONDUTOR'
  | 'ESTRUTURA'
  | 'EQUIPAMENTO'
  | 'ATERRAMENTO'
  | 'FERRAGEM';

export interface ItemMaterial {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  categoria: CategoriaMaterial;
  valor_unitario?: number;
}

export interface ResumoMateriais {
  total_postes: number;
  total_metros_mt: number;
  total_metros_bt: number;
  total_trafos: number;
  total_chaves: number;
  total_aterramentos: number;
  total_itens: number;
  valor_estimado?: number;
}

export interface ListaMateriais {
  itens: ItemMaterial[];
  resumo: ResumoMateriais;
}

// =============================================================================
// CONFIGURAÇÃO DO PROJETO
// =============================================================================

export type Distribuidora = 'EQUATORIAL';
export type TipoArea = 'URBANA' | 'RURAL';
export type ZonaCorrosao = 'NORMAL' | 'P1' | 'P2';
export type NaturezaRede = 'MONOFASICA' | 'TRIFASICA';
export type TipoRedeConfig = 'COMPACTA' | 'CONVENCIONAL';

export interface ConfigProjeto {
  distribuidora: Distribuidora;
  estado: string;
  tipoArea: TipoArea;
  zonaCorrosao: ZonaCorrosao;
  tipoRede: TipoRedeConfig;
  natureza: NaturezaRede;
  tensaoMT: number;
  tensaoBT: number;
  condutorMT: string;
  condutorBT: string;
  comBT: boolean;
}

export interface ConfigGeracao {
  tipo_rede?: string;
  distribuidora?: string;
  trafo_kva?: number;
  rede?: 'MT' | 'BT';
  comBT?: boolean;
  regiao?: 'urbana' | 'rural';
  classe_tensao?: string;
}

// =============================================================================
// RESULTADO DA GERAÇÃO
// =============================================================================

export interface ResultadoGeracao {
  postes: PosteGerado[];
  condutores: CondutorGerado[];
  barreiras: RelatorioBarreiras;
  materiais: ListaMateriais;
  dxf: string;
  perfil_altimetrico?: PerfilAltimetrico;
  estatisticas: EstatisticasProjeto;
  validacao: ValidacaoProjeto;
}

export interface EstatisticasProjeto {
  total_postes: number;
  postes_novos: number;
  postes_existentes: number;
  extensao_mt: number;
  extensao_bt: number;
  total_trafos: number;
  total_chaves: number;
  total_barreiras: number;
}

export interface ValidacaoProjeto {
  valido: boolean;
  erros: string[];
  avisos: string[];
}

// =============================================================================
// ORDEM DE SERVIÇO
// =============================================================================

export interface OrdemServico {
  id: number;
  numero_os: string;
  cliente_nome: string;
  cliente_cpf_cnpj?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_endereco?: string;
  tipo_projeto: string;
  distribuidora: string;
  tipo_rede: string;
  tensao_mt?: number;
  carga_estimada_kva?: number;
  observacoes?: string;
  ponto_origem_latitude: number;
  ponto_origem_longitude: number;
  ponto_destino_latitude: number;
  ponto_destino_longitude: number;
  status: string;
  criado_em: Date;
  atualizado_em: Date;
}

// =============================================================================
// RESPOSTAS DA API
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface GerarProjetoResponse {
  postes: PosteGerado[];
  condutores: CondutorGerado[];
  barreiras: RelatorioBarreiras;
  materiais: ListaMateriais;
  estatisticas: EstatisticasProjeto;
  validacao: ValidacaoProjeto;
  tempo_geracao_ms: number;
}

export interface BarreirasResponse {
  barreiras: Barreira[];
  resumo: ResumoBarreiras;
}

export interface MateriaisResponse {
  itens: ItemMaterial[];
  resumo: ResumoMateriais;
}

export interface PerfilAltimetricoResponse {
  pontos: PontoElevacao[];
  elevacao_minima: number;
  elevacao_maxima: number;
  desnivel_total: number;
  declive_maximo: number;
}
