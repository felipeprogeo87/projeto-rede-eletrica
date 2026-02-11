// =============================================================================
// Serviço: Geração de DXF (Drawing Exchange Format)
// =============================================================================
//
// Gera arquivos DXF no padrão Equatorial Energia para projetos elétricos.
// Coordenadas são convertidas de Lat/Lon (WGS84) para UTM (metros).
//
// Layers padrão:
// - REDE_MT_PROJ: traçado MT projetado (vermelho)
// - REDE_BT_PROJ: traçado BT projetado (azul)
// - POSTE_PROJ: postes projetados (amarelo)
// - TRAFO_PROJ: transformadores (verde)
// - CHAVE_PROJ: chaves fusíveis/seccionadoras (magenta)
// - TEXTO_PG_PROJ: textos de postes (branco)
// - TEXTO_COND_PROJ: textos de condutores (branco)
//
// =============================================================================

// @ts-ignore - dxf-writer não tem tipos TypeScript
import Drawing from 'dxf-writer';
import { ConfigProjeto, NaturezaRede } from './regrasEquatorialService';
import { RelatorioBarreiras, PosteGerado } from './barreirasService';
import { CondutorGerado, PosteComEquipamentos } from './materiaisService';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface CoordenadaUTM {
  x: number;  // Easting (metros)
  y: number;  // Northing (metros)
  zona: number;
  hemisferio: 'N' | 'S';
}

export interface ConfigDXF {
  escala: number;           // escala do desenho (default: 1)
  alturaTexto: number;      // altura do texto em metros (default: 2)
  offsetTextoPoste: number; // offset do texto do poste (default: 3)
  mostrarBarreiras: boolean;
  mostrarAterramento: boolean;
}

// -----------------------------------------------------------------------------
// Constantes - Layers Equatorial
// -----------------------------------------------------------------------------

/**
 * Cores ACI (AutoCAD Color Index)
 */
const CORES_ACI = {
  VERMELHO: 1,
  AMARELO: 2,
  VERDE: 3,
  CIANO: 4,
  AZUL: 5,
  MAGENTA: 6,
  BRANCO: 7,
  CINZA: 8,
  LARANJA: 30,
} as const;

/**
 * Layers padrão Equatorial
 */
const LAYERS_EQUATORIAL = [
  { nome: 'REDE_MT_PROJ', cor: CORES_ACI.VERMELHO, tipo: 'CONTINUOUS' },
  { nome: 'REDE_BT_PROJ', cor: CORES_ACI.AZUL, tipo: 'CONTINUOUS' },
  { nome: 'REDE_MT_EXIST', cor: CORES_ACI.CINZA, tipo: 'CONTINUOUS' },
  { nome: 'REDE_BT_EXIST', cor: CORES_ACI.CINZA, tipo: 'CONTINUOUS' },
  { nome: 'POSTE_PROJ', cor: CORES_ACI.AMARELO, tipo: 'CONTINUOUS' },
  { nome: 'POSTE_EXIST', cor: CORES_ACI.CINZA, tipo: 'CONTINUOUS' },
  { nome: 'TRAFO_PROJ', cor: CORES_ACI.VERDE, tipo: 'CONTINUOUS' },
  { nome: 'CHAVE_PROJ', cor: CORES_ACI.MAGENTA, tipo: 'CONTINUOUS' },
  { nome: 'TEXTO_PG_PROJ', cor: CORES_ACI.BRANCO, tipo: 'CONTINUOUS' },
  { nome: 'TEXTO_COND_PROJ', cor: CORES_ACI.BRANCO, tipo: 'CONTINUOUS' },
  { nome: 'ESTAI_PROJ', cor: CORES_ACI.CIANO, tipo: 'CONTINUOUS' },
  { nome: 'ATERRAMENTO_PROJ', cor: CORES_ACI.LARANJA, tipo: 'CONTINUOUS' },
  { nome: 'BARREIRA', cor: CORES_ACI.VERMELHO, tipo: 'DASHED' },
] as const;

// -----------------------------------------------------------------------------
// Conversão Lat/Lon para UTM
// -----------------------------------------------------------------------------

/**
 * Converte coordenadas Lat/Lon (WGS84) para UTM
 * Implementação baseada nas fórmulas de projeção UTM
 */
function latLonParaUTM(lat: number, lon: number): CoordenadaUTM {
  // Constantes WGS84
  const a = 6378137.0;              // raio equatorial
  const f = 1 / 298.257223563;      // achatamento
  const k0 = 0.9996;                // fator de escala
  const e = Math.sqrt(2 * f - f * f);
  const e2 = e * e;
  const ep2 = e2 / (1 - e2);

  // Determinar zona UTM
  const zona = Math.floor((lon + 180) / 6) + 1;
  const lonOrigem = (zona - 1) * 6 - 180 + 3; // longitude central da zona

  // Converter para radianos
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lonOrigemRad = lonOrigem * Math.PI / 180;

  // Cálculos intermediários
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = ep2 * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lonRad - lonOrigemRad);

  // Comprimento do arco meridiano
  const M = a * (
    (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * latRad)
  );

  // Coordenadas UTM
  const x = k0 * N * (
    A + (1 - T + C) * A * A * A / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A * A * A * A * A / 120
  ) + 500000; // Falso Easting

  let y = k0 * (
    M + N * Math.tan(latRad) * (
      A * A / 2
      + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A * A * A * A * A * A / 720
    )
  );

  // Ajuste para hemisfério sul
  const hemisferio: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  if (hemisferio === 'S') {
    y += 10000000; // Falso Northing para hemisfério sul
  }

  return { x, y, zona, hemisferio };
}

/**
 * Converte array de postes para coordenadas UTM
 */
function converterPostesParaUTM(postes: PosteGerado[]): Map<string, CoordenadaUTM> {
  const mapa = new Map<string, CoordenadaUTM>();
  for (const poste of postes) {
    const utm = latLonParaUTM(poste.latitude, poste.longitude);
    mapa.set(poste.id, utm);
  }
  return mapa;
}

// -----------------------------------------------------------------------------
// Funções de Desenho
// -----------------------------------------------------------------------------

/**
 * Calcula anotação do condutor no formato Equatorial
 */
function calcularAnotacaoCondutor(
  condutor: CondutorGerado,
  config: ConfigProjeto
): string {
  const comprimento = Math.round(condutor.comprimento_metros);

  if (condutor.tipo_rede === 'MT') {
    // Formato: "ABC 3 #1/0 AWG CAA" ou "AC 2 #1/0 AWG CAA"
    const fases = config.natureza === 'TRIFASICA' ? 'ABC' :
                  config.natureza === 'BIFASICA' ? 'AB' : 'AC';
    const numCond = config.natureza === 'TRIFASICA' ? 3 :
                    config.natureza === 'BIFASICA' ? 2 : 2;

    // Determinar tipo de cabo
    const isCompacta = config.tipoRede === 'COMPACTA';
    const tipoCabo = isCompacta ? 'XLPE' : 'CAA';

    return `${comprimento}m ${fases} ${numCond} #${config.condutorMT} ${tipoCabo}`;
  } else {
    // BT Multiplex - Formato: "ABCN 4 #35(35) MULT"
    const fases = config.natureza === 'TRIFASICA' ? 'ABCN' :
                  config.natureza === 'BIFASICA' ? 'ABN' : 'AN';
    const numCond = config.natureza === 'TRIFASICA' ? 4 :
                    config.natureza === 'BIFASICA' ? 3 : 2;

    return `${comprimento}m ${fases} ${numCond} #${config.condutorBT} MULT`;
  }
}

/**
 * Calcula anotação do poste no formato Equatorial
 */
function calcularAnotacaoPoste(poste: PosteComEquipamentos): string {
  // Formato: "DT 11/300" ou "DT 11/600"
  return `DT ${poste.altura}/${poste.resistencia}`;
}

/**
 * Calcula ponto médio entre dois pontos UTM
 */
function pontoMedio(p1: CoordenadaUTM, p2: CoordenadaUTM): CoordenadaUTM {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    zona: p1.zona,
    hemisferio: p1.hemisferio,
  };
}

/**
 * Calcula ângulo entre dois pontos (em graus)
 */
function calcularAngulo(p1: CoordenadaUTM, p2: CoordenadaUTM): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const dxfService = {
  /**
   * Gera arquivo DXF completo do projeto
   */
  gerarDXF(
    postes: PosteComEquipamentos[],
    condutores: CondutorGerado[],
    barreiras: RelatorioBarreiras,
    config: ConfigProjeto,
    configDXF?: Partial<ConfigDXF>
  ): string {
    console.log(`[DXF] Gerando DXF para ${postes.length} postes e ${condutores.length} condutores...`);

    // Configuração padrão
    const opcoes: ConfigDXF = {
      escala: 1,
      alturaTexto: 2,
      offsetTextoPoste: 3,
      mostrarBarreiras: true,
      mostrarAterramento: true,
      ...configDXF,
    };

    // Criar desenho
    const drawing = new Drawing();
    drawing.setUnits('Meters');

    // Adicionar layers
    this.criarLayers(drawing);

    // Converter postes para UTM
    const postesUTM = converterPostesParaUTM(postes);

    // Adicionar elementos ao desenho
    this.adicionarPostes(drawing, postes, postesUTM, opcoes);
    this.adicionarCondutores(drawing, condutores, postes, postesUTM, config, opcoes);
    this.adicionarEquipamentos(drawing, postes, postesUTM, opcoes);

    if (opcoes.mostrarBarreiras) {
      this.adicionarBarreiras(drawing, barreiras, postesUTM, postes);
    }

    if (opcoes.mostrarAterramento) {
      this.adicionarAterramento(drawing, postes, postesUTM, opcoes);
    }

    // Gerar string DXF
    const dxfString = drawing.toDxfString();

    console.log(`[DXF] DXF gerado: ${Math.round(dxfString.length / 1024)}KB`);

    return dxfString;
  },

  /**
   * Cria layers no padrão Equatorial
   */
  criarLayers(drawing: any): void {
    for (const layer of LAYERS_EQUATORIAL) {
      drawing.addLayer(layer.nome, layer.cor, layer.tipo);
    }
    console.log(`[DXF] ${LAYERS_EQUATORIAL.length} layers criados`);
  },

  /**
   * Adiciona postes ao desenho
   */
  adicionarPostes(
    drawing: any,
    postes: PosteComEquipamentos[],
    postesUTM: Map<string, CoordenadaUTM>,
    opcoes: ConfigDXF
  ): void {
    let contProj = 0;
    let contExist = 0;

    for (const poste of postes) {
      const utm = postesUTM.get(poste.id);
      if (!utm) continue;

      const isExistente = poste.tipo === 'existente';
      const layer = isExistente ? 'POSTE_EXIST' : 'POSTE_PROJ';
      const layerTexto = isExistente ? 'POSTE_EXIST' : 'TEXTO_PG_PROJ';

      // Desenhar círculo do poste (raio de 1m)
      drawing.setActiveLayer(layer);
      drawing.drawCircle(utm.x, utm.y, 1);

      // Desenhar cruz no centro
      drawing.drawLine(utm.x - 0.7, utm.y, utm.x + 0.7, utm.y);
      drawing.drawLine(utm.x, utm.y - 0.7, utm.x, utm.y + 0.7);

      // Texto do código do poste
      drawing.setActiveLayer(layerTexto);
      drawing.drawText(
        utm.x + opcoes.offsetTextoPoste,
        utm.y + opcoes.offsetTextoPoste,
        opcoes.alturaTexto,
        0,
        poste.codigo
      );

      // Texto da especificação do poste (abaixo do código)
      const anotacao = calcularAnotacaoPoste(poste);
      drawing.drawText(
        utm.x + opcoes.offsetTextoPoste,
        utm.y + opcoes.offsetTextoPoste - opcoes.alturaTexto * 1.5,
        opcoes.alturaTexto * 0.8,
        0,
        anotacao
      );

      if (isExistente) contExist++;
      else contProj++;
    }

    console.log(`[DXF] Postes adicionados: ${contProj} projetados, ${contExist} existentes`);
  },

  /**
   * Adiciona condutores (linhas entre postes)
   */
  adicionarCondutores(
    drawing: any,
    condutores: CondutorGerado[],
    postes: PosteComEquipamentos[],
    postesUTM: Map<string, CoordenadaUTM>,
    config: ConfigProjeto,
    opcoes: ConfigDXF
  ): void {
    // Agrupar condutores por tipo
    const condutoresMT = condutores.filter(c => c.tipo_rede === 'MT');
    const condutoresBT = condutores.filter(c => c.tipo_rede === 'BT');

    // Desenhar condutores MT
    drawing.setActiveLayer('REDE_MT_PROJ');
    for (const condutor of condutoresMT) {
      const p1 = postesUTM.get(condutor.poste_origem_id);
      const p2 = postesUTM.get(condutor.poste_destino_id);

      if (!p1 || !p2) continue;

      // Linha do condutor
      drawing.drawLine(p1.x, p1.y, p2.x, p2.y);

      // Texto da anotação no ponto médio
      const meio = pontoMedio(p1, p2);
      const angulo = calcularAngulo(p1, p2);

      drawing.setActiveLayer('TEXTO_COND_PROJ');
      drawing.drawText(
        meio.x,
        meio.y + opcoes.alturaTexto,
        opcoes.alturaTexto * 0.7,
        angulo,
        calcularAnotacaoCondutor(condutor, config)
      );

      drawing.setActiveLayer('REDE_MT_PROJ');
    }

    // Desenhar condutores BT
    drawing.setActiveLayer('REDE_BT_PROJ');
    for (const condutor of condutoresBT) {
      const p1 = postesUTM.get(condutor.poste_origem_id);
      const p2 = postesUTM.get(condutor.poste_destino_id);

      if (!p1 || !p2) continue;

      // Linha do condutor (com pequeno offset para não sobrepor MT)
      const offsetY = 0.5;
      drawing.drawLine(p1.x, p1.y - offsetY, p2.x, p2.y - offsetY);

      // Texto da anotação
      const meio = pontoMedio(p1, p2);
      const angulo = calcularAngulo(p1, p2);

      drawing.setActiveLayer('TEXTO_COND_PROJ');
      drawing.drawText(
        meio.x,
        meio.y - opcoes.alturaTexto * 2,
        opcoes.alturaTexto * 0.7,
        angulo,
        calcularAnotacaoCondutor(condutor, config)
      );

      drawing.setActiveLayer('REDE_BT_PROJ');
    }

    console.log(`[DXF] Condutores adicionados: ${condutoresMT.length} MT, ${condutoresBT.length} BT`);
  },

  /**
   * Adiciona símbolos de equipamentos (trafos, chaves)
   */
  adicionarEquipamentos(
    drawing: any,
    postes: PosteComEquipamentos[],
    postesUTM: Map<string, CoordenadaUTM>,
    opcoes: ConfigDXF
  ): void {
    let contTrafos = 0;
    let contChaves = 0;

    for (const poste of postes) {
      const utm = postesUTM.get(poste.id);
      if (!utm) continue;

      // Transformador - desenhar quadrado com X
      if (poste.trafo_kva) {
        drawing.setActiveLayer('TRAFO_PROJ');

        const tamanho = 3;
        const x = utm.x - tamanho * 2;
        const y = utm.y;

        // Quadrado
        drawing.drawLine(x - tamanho, y - tamanho, x + tamanho, y - tamanho);
        drawing.drawLine(x + tamanho, y - tamanho, x + tamanho, y + tamanho);
        drawing.drawLine(x + tamanho, y + tamanho, x - tamanho, y + tamanho);
        drawing.drawLine(x - tamanho, y + tamanho, x - tamanho, y - tamanho);

        // X interno
        drawing.drawLine(x - tamanho, y - tamanho, x + tamanho, y + tamanho);
        drawing.drawLine(x - tamanho, y + tamanho, x + tamanho, y - tamanho);

        // Texto da potência
        drawing.setActiveLayer('TEXTO_PG_PROJ');
        drawing.drawText(
          x,
          y - tamanho - opcoes.alturaTexto,
          opcoes.alturaTexto * 0.8,
          0,
          `${poste.trafo_kva}kVA`
        );

        contTrafos++;
      }

      // Chave fusível - desenhar retângulo com ponto
      if (poste.chave_fusivel) {
        drawing.setActiveLayer('CHAVE_PROJ');

        const tamanho = 1.5;
        const x = utm.x + tamanho * 3;
        const y = utm.y + tamanho * 2;

        // Retângulo
        drawing.drawLine(x - tamanho, y - tamanho / 2, x + tamanho, y - tamanho / 2);
        drawing.drawLine(x + tamanho, y - tamanho / 2, x + tamanho, y + tamanho / 2);
        drawing.drawLine(x + tamanho, y + tamanho / 2, x - tamanho, y + tamanho / 2);
        drawing.drawLine(x - tamanho, y + tamanho / 2, x - tamanho, y - tamanho / 2);

        // Ponto central
        drawing.drawCircle(x, y, 0.3);

        // Texto
        drawing.setActiveLayer('TEXTO_PG_PROJ');
        drawing.drawText(x, y + tamanho, opcoes.alturaTexto * 0.6, 0, 'CF');

        contChaves++;
      }

      // Chave faca - desenhar símbolo diferente
      if (poste.chave_faca) {
        drawing.setActiveLayer('CHAVE_PROJ');

        const tamanho = 1.5;
        const x = utm.x + tamanho * 3;
        const y = utm.y - tamanho * 2;

        // Linha diagonal (representa a lâmina)
        drawing.drawLine(x - tamanho, y, x + tamanho, y + tamanho);

        // Círculos nas pontas
        drawing.drawCircle(x - tamanho, y, 0.4);
        drawing.drawCircle(x + tamanho, y + tamanho, 0.4);

        // Texto
        drawing.setActiveLayer('TEXTO_PG_PROJ');
        drawing.drawText(x, y - tamanho, opcoes.alturaTexto * 0.6, 0, 'CS');

        contChaves++;
      }
    }

    console.log(`[DXF] Equipamentos adicionados: ${contTrafos} trafos, ${contChaves} chaves`);
  },

  /**
   * Adiciona indicadores de barreiras
   */
  adicionarBarreiras(
    drawing: any,
    barreiras: RelatorioBarreiras,
    postesUTM: Map<string, CoordenadaUTM>,
    postes: PosteComEquipamentos[]
  ): void {
    drawing.setActiveLayer('BARREIRA');

    for (const barreira of barreiras.barreiras) {
      // Converter coordenada da barreira para UTM
      const utm = latLonParaUTM(barreira.coordenada.lat, barreira.coordenada.lng);

      // Desenhar triângulo de aviso
      const tamanho = 5;
      drawing.drawLine(utm.x, utm.y + tamanho, utm.x - tamanho, utm.y - tamanho);
      drawing.drawLine(utm.x - tamanho, utm.y - tamanho, utm.x + tamanho, utm.y - tamanho);
      drawing.drawLine(utm.x + tamanho, utm.y - tamanho, utm.x, utm.y + tamanho);

      // Ponto de exclamação interno
      drawing.drawLine(utm.x, utm.y + tamanho * 0.3, utm.x, utm.y - tamanho * 0.2);
      drawing.drawCircle(utm.x, utm.y - tamanho * 0.5, 0.3);

      // Texto descritivo
      drawing.drawText(utm.x + tamanho, utm.y, 1.5, 0, barreira.tipo);
    }

    console.log(`[DXF] Barreiras adicionadas: ${barreiras.barreiras.length}`);
  },

  /**
   * Adiciona símbolos de aterramento
   */
  adicionarAterramento(
    drawing: any,
    postes: PosteComEquipamentos[],
    postesUTM: Map<string, CoordenadaUTM>,
    opcoes: ConfigDXF
  ): void {
    drawing.setActiveLayer('ATERRAMENTO_PROJ');

    let count = 0;
    for (const poste of postes) {
      if (!poste.aterramento) continue;

      const utm = postesUTM.get(poste.id);
      if (!utm) continue;

      // Símbolo de aterramento (3 linhas horizontais decrescentes)
      const x = utm.x - 4;
      const y = utm.y - 3;

      drawing.drawLine(x - 2, y, x + 2, y);
      drawing.drawLine(x - 1.3, y - 0.5, x + 1.3, y - 0.5);
      drawing.drawLine(x - 0.6, y - 1, x + 0.6, y - 1);

      // Linha conectando ao poste
      drawing.drawLine(x, y, x, y + 2);
      drawing.drawLine(x, y + 2, utm.x - 1, utm.y);

      count++;
    }

    console.log(`[DXF] Aterramentos adicionados: ${count}`);
  },

  /**
   * Gera DXF como Buffer para download
   */
  gerarDXFBuffer(
    postes: PosteComEquipamentos[],
    condutores: CondutorGerado[],
    barreiras: RelatorioBarreiras,
    config: ConfigProjeto,
    configDXF?: Partial<ConfigDXF>
  ): Buffer {
    const dxfString = this.gerarDXF(postes, condutores, barreiras, config, configDXF);
    return Buffer.from(dxfString, 'utf-8');
  },

  /**
   * Retorna os layers disponíveis
   */
  getLayers(): typeof LAYERS_EQUATORIAL {
    return LAYERS_EQUATORIAL;
  },

  /**
   * Converte uma coordenada para UTM (função utilitária exportada)
   */
  converterParaUTM(lat: number, lon: number): CoordenadaUTM {
    return latLonParaUTM(lat, lon);
  },
};

export default dxfService;
