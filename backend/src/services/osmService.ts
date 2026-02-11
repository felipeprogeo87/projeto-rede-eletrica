// =============================================================================
// Serviço: OpenStreetMap (Overpass API)
// =============================================================================
//
// Este serviço busca dados do terreno via OpenStreetMap:
// - Ruas e calçadas (onde a rede pode passar)
// - Edificações (manter distância)
// - Rios, ferrovias, rodovias (obstáculos)
// - Áreas verdes, praças e ÁRVORES INDIVIDUAIS
//
// API utilizada: Overpass API (gratuita, sem autenticação)
// Documentação: https://wiki.openstreetmap.org/wiki/Overpass_API
//
// =============================================================================

import axios from 'axios';

// -----------------------------------------------------------------------------
// Configuração
// -----------------------------------------------------------------------------

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// URLs alternativas caso a principal esteja lenta
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface Coordenada {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  sul: number;   // latitude mínima
  oeste: number; // longitude mínima
  norte: number; // latitude máxima
  leste: number; // longitude máxima
}

export interface Rua {
  id: number;
  nome: string;
  tipo: string; // residential, primary, secondary, etc.
  pontos: Coordenada[];
  largura?: number;
  maoUnica?: boolean;
}

export interface Edificacao {
  id: number;
  tipo: string;
  pontos: Coordenada[]; // polígono
  altura?: number;
  nome?: string;
}

export interface Obstaculo {
  id: number;
  tipo: 'rio' | 'ferrovia' | 'rodovia' | 'area_verde' | 'lago' | 'linha_transmissao' | 'arvore';
  nome?: string;
  pontos: Coordenada[];
}

export interface DadosTerreno {
  ruas: Rua[];
  edificacoes: Edificacao[];
  obstaculos: Obstaculo[];
  boundingBox: BoundingBox;
}

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

/**
 * Calcula bounding box a partir de dois pontos com margem
 */
function calcularBoundingBox(origem: Coordenada, destino: Coordenada, margemMetros: number = 200): BoundingBox {
  // Conversão aproximada: 1 grau ≈ 111km
  const margemGraus = margemMetros / 111000;
  
  const minLat = Math.min(origem.lat, destino.lat) - margemGraus;
  const maxLat = Math.max(origem.lat, destino.lat) + margemGraus;
  const minLng = Math.min(origem.lng, destino.lng) - margemGraus;
  const maxLng = Math.max(origem.lng, destino.lng) + margemGraus;
  
  return {
    sul: minLat,
    oeste: minLng,
    norte: maxLat,
    leste: maxLng,
  };
}

/**
 * Executa query no Overpass API
 */
async function executarQueryOverpass(query: string): Promise<any> {
  let lastError: Error | null = null;
  
  for (const url of OVERPASS_URLS) {
    try {
      const response = await axios.post(url, `data=${encodeURIComponent(query)}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 30000, // 30 segundos
      });
      
      return response.data;
    } catch (error: any) {
      console.warn(`[OSM] Falha em ${url}: ${error.message}`);
      lastError = error;
    }
  }
  
  throw lastError || new Error('Falha ao conectar com Overpass API');
}

/**
 * Converte elementos do OSM para array de coordenadas
 */
function extrairCoordenadas(element: any, nodes: Map<number, Coordenada>): Coordenada[] {
  if (element.type === 'node') {
    return [{ lat: element.lat, lng: element.lon }];
  }
  
  if (element.type === 'way' && element.nodes) {
    return element.nodes
      .map((nodeId: number) => nodes.get(nodeId))
      .filter((coord: Coordenada | undefined) => coord !== undefined) as Coordenada[];
  }
  
  if (element.geometry) {
    return element.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon }));
  }
  
  return [];
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const osmService = {
  /**
   * Busca todos os dados do terreno na área entre origem e destino
   */
  async buscarDadosTerreno(origem: Coordenada, destino: Coordenada): Promise<DadosTerreno> {
    console.log('[OSM] Buscando dados do terreno...');
    
    const bbox = calcularBoundingBox(origem, destino, 300);
    const bboxStr = `${bbox.sul},${bbox.oeste},${bbox.norte},${bbox.leste}`;
    
    // Query Overpass para buscar ruas, edificações, obstáculos e ÁRVORES
    const query = `
      [out:json][timeout:30];
      (
        // Ruas e caminhos
        way["highway"~"residential|tertiary|secondary|primary|unclassified|service|footway|path"](${bboxStr});
        
        // Edificações
        way["building"](${bboxStr});
        
        // Rios e córregos
        way["waterway"~"river|stream|canal|ditch"](${bboxStr});
        
        // Lagos e represas
        way["natural"="water"](${bboxStr});
        relation["natural"="water"](${bboxStr});
        
        // Ferrovias
        way["railway"~"rail|subway|tram|light_rail"](${bboxStr});
        
        // Linhas de transmissão existentes
        way["power"~"line|minor_line"](${bboxStr});
        
        // === ÁRVORES INDIVIDUAIS ===
        node["natural"="tree"](${bboxStr});
        
        // === VEGETAÇÃO E ÁREAS VERDES ===
        way["landuse"~"forest|grass|orchard|vineyard"](${bboxStr});
        way["natural"~"wood|scrub|tree_row|heath"](${bboxStr});
        way["leisure"="park"](${bboxStr});
        way["leisure"="garden"](${bboxStr});
        
        // Rodovias principais (para altura mínima em travessias)
        way["highway"~"trunk|motorway|trunk_link|motorway_link|primary"](${bboxStr});
      );
      out body geom;
    `;
    
    const data = await executarQueryOverpass(query);
    
    // Processar resultados
    const ruas: Rua[] = [];
    const edificacoes: Edificacao[] = [];
    const obstaculos: Obstaculo[] = [];
    
    // Mapa de nodes para resolver referências
    const nodes = new Map<number, Coordenada>();
    
    // Primeiro passo: coletar todos os nodes
    if (!data.elements || !Array.isArray(data.elements)) {
      console.warn('[OSM] Resposta sem elements, retornando dados vazios');
      return { ruas, edificacoes, obstaculos, boundingBox: bbox };
    }
    for (const element of data.elements) {
      if (element.type === 'node') {
        nodes.set(element.id, { lat: element.lat, lng: element.lon });
      }
    }
    
    // Segundo passo: processar elementos
    for (const element of data.elements) {
      const tags = element.tags || {};
      
      // === ÁRVORES INDIVIDUAIS (nodes) ===
      if (element.type === 'node' && tags.natural === 'tree') {
        obstaculos.push({
          id: element.id,
          tipo: 'arvore',
          nome: tags.species || tags.genus || tags['species:pt'] || 'Árvore',
          pontos: [{ lat: element.lat, lng: element.lon }],
        });
        continue;
      }
      
      // Para ways, extrair coordenadas
      const coords = extrairCoordenadas(element, nodes);
      if (coords.length === 0) continue;
      
      // Classificar elemento
      if (tags.highway) {
        // É uma via
        const tiposRodovia = ['trunk', 'motorway', 'trunk_link', 'motorway_link'];
        const tiposRodoviaSecundaria = ['primary'];
        
        if (tiposRodovia.includes(tags.highway)) {
          // Rodovia principal - obstáculo crítico
          obstaculos.push({
            id: element.id,
            tipo: 'rodovia',
            nome: tags.name || tags.ref || `Rodovia ${tags.highway}`,
            pontos: coords,
          });
        } else if (tiposRodoviaSecundaria.includes(tags.highway)) {
          // Via principal - obstáculo mas também pode ser rota
          obstaculos.push({
            id: element.id,
            tipo: 'rodovia',
            nome: tags.name || tags.ref,
            pontos: coords,
          });
          // Também adiciona como rua para roteamento
          ruas.push({
            id: element.id,
            nome: tags.name || 'Sem nome',
            tipo: tags.highway,
            pontos: coords,
            largura: tags.width ? parseFloat(tags.width) : undefined,
            maoUnica: tags.oneway === 'yes',
          });
        } else {
          // Rua normal - pode passar rede
          ruas.push({
            id: element.id,
            nome: tags.name || 'Sem nome',
            tipo: tags.highway,
            pontos: coords,
            largura: tags.width ? parseFloat(tags.width) : undefined,
            maoUnica: tags.oneway === 'yes',
          });
        }
      } else if (tags.building) {
        // Edificação
        edificacoes.push({
          id: element.id,
          tipo: tags.building,
          pontos: coords,
          altura: tags.height ? parseFloat(tags.height) : 
                  tags['building:levels'] ? parseFloat(tags['building:levels']) * 3 : undefined,
          nome: tags.name,
        });
      } else if (tags.waterway || tags.natural === 'water') {
        // Rio, córrego ou lago
        obstaculos.push({
          id: element.id,
          tipo: tags.waterway ? 'rio' : 'lago',
          nome: tags.name,
          pontos: coords,
        });
      } else if (tags.railway) {
        // Ferrovia
        obstaculos.push({
          id: element.id,
          tipo: 'ferrovia',
          nome: tags.name || tags.operator,
          pontos: coords,
        });
      } else if (tags.power === 'line' || tags.power === 'minor_line') {
        // Linha de transmissão
        obstaculos.push({
          id: element.id,
          tipo: 'linha_transmissao',
          nome: tags.name || (tags.voltage ? `LT ${tags.voltage}kV` : 'Linha de transmissão'),
          pontos: coords,
        });
      } else if (
        // === VEGETAÇÃO E ÁREAS VERDES ===
        tags.landuse === 'forest' || 
        tags.landuse === 'grass' ||
        tags.landuse === 'orchard' ||
        tags.landuse === 'vineyard' ||
        tags.natural === 'wood' || 
        tags.natural === 'scrub' ||
        tags.natural === 'tree_row' ||
        tags.natural === 'heath' ||
        tags.leisure === 'park' ||
        tags.leisure === 'garden'
      ) {
        // Área verde / vegetação
        const tipoVegetacao = tags.natural || tags.landuse || tags.leisure;
        obstaculos.push({
          id: element.id,
          tipo: 'area_verde',
          nome: tags.name || tipoVegetacao,
          pontos: coords,
        });
      }
    }
    
    // Contar árvores para log
    const qtdArvores = obstaculos.filter(o => o.tipo === 'arvore').length;
    const qtdAreaVerde = obstaculos.filter(o => o.tipo === 'area_verde').length;
    
    console.log(`[OSM] Encontrado: ${ruas.length} ruas, ${edificacoes.length} edificações, ${obstaculos.length} obstáculos`);
    console.log(`[OSM]   - ${qtdArvores} árvores individuais`);
    console.log(`[OSM]   - ${qtdAreaVerde} áreas de vegetação`);
    console.log(`[OSM]   - ${obstaculos.filter(o => o.tipo === 'rodovia').length} rodovias`);
    console.log(`[OSM]   - ${obstaculos.filter(o => o.tipo === 'rio').length} rios/córregos`);
    console.log(`[OSM]   - ${obstaculos.filter(o => o.tipo === 'ferrovia').length} ferrovias`);
    console.log(`[OSM]   - ${obstaculos.filter(o => o.tipo === 'linha_transmissao').length} linhas de transmissão`);
    
    return {
      ruas,
      edificacoes,
      obstaculos,
      boundingBox: bbox,
    };
  },
  
  /**
   * Busca apenas as ruas para roteamento
   */
  async buscarRuas(origem: Coordenada, destino: Coordenada): Promise<Rua[]> {
    console.log('[OSM] Buscando ruas para roteamento...');
    
    const bbox = calcularBoundingBox(origem, destino, 500);
    const bboxStr = `${bbox.sul},${bbox.oeste},${bbox.norte},${bbox.leste}`;
    
    const query = `
      [out:json][timeout:25];
      (
        way["highway"~"residential|tertiary|secondary|primary|unclassified|service"](${bboxStr});
      );
      out body geom;
    `;
    
    const data = await executarQueryOverpass(query);
    
    const ruas: Rua[] = [];

    if (!data.elements || !Array.isArray(data.elements)) {
      console.warn('[OSM] buscarRuasAlternativo: Resposta sem elements');
      return ruas;
    }
    for (const element of data.elements) {
      if (element.type === 'way' && element.geometry) {
        const coords = element.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon }));
        const tags = element.tags || {};
        
        ruas.push({
          id: element.id,
          nome: tags.name || 'Sem nome',
          tipo: tags.highway,
          pontos: coords,
        });
      }
    }
    
    console.log(`[OSM] Encontradas ${ruas.length} ruas`);
    return ruas;
  },
  
  /**
   * Busca rua mais próxima de um ponto
   */
  async buscarRuaMaisProxima(ponto: Coordenada, raioMetros: number = 50): Promise<Rua | null> {
    // Conversão aproximada
    const raioGraus = raioMetros / 111000;
    
    const query = `
      [out:json][timeout:10];
      (
        way["highway"~"residential|tertiary|secondary|primary|unclassified|service"]
        (around:${raioMetros},${ponto.lat},${ponto.lng});
      );
      out body geom;
    `;
    
    const data = await executarQueryOverpass(query);
    
    if (data.elements.length === 0) {
      return null;
    }
    
    // Retorna a primeira rua encontrada
    const element = data.elements[0];
    const tags = element.tags || {};
    
    return {
      id: element.id,
      nome: tags.name || 'Sem nome',
      tipo: tags.highway,
      pontos: element.geometry?.map((g: any) => ({ lat: g.lat, lng: g.lon })) || [],
    };
  },
  
  /**
   * Verifica se um ponto está dentro de uma edificação
   */
  pontoEmEdificacao(ponto: Coordenada, edificacoes: Edificacao[]): boolean {
    for (const edificacao of edificacoes) {
      if (this.pontoEmPoligono(ponto, edificacao.pontos)) {
        return true;
      }
    }
    return false;
  },
  
  /**
   * Verifica se um ponto está dentro de um polígono (Ray casting)
   */
  pontoEmPoligono(ponto: Coordenada, poligono: Coordenada[]): boolean {
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
  },
  
  /**
   * Calcula distância de um ponto a uma linha (segmento)
   */
  distanciaPontoLinha(ponto: Coordenada, linhaInicio: Coordenada, linhaFim: Coordenada): number {
    const A = ponto.lat - linhaInicio.lat;
    const B = ponto.lng - linhaInicio.lng;
    const C = linhaFim.lat - linhaInicio.lat;
    const D = linhaFim.lng - linhaInicio.lng;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) {
      param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
      xx = linhaInicio.lat;
      yy = linhaInicio.lng;
    } else if (param > 1) {
      xx = linhaFim.lat;
      yy = linhaFim.lng;
    } else {
      xx = linhaInicio.lat + param * C;
      yy = linhaInicio.lng + param * D;
    }
    
    const dx = ponto.lat - xx;
    const dy = ponto.lng - yy;
    
    // Converter para metros (aproximado)
    return Math.sqrt(dx * dx + dy * dy) * 111000;
  },
  
  /**
   * Encontra o ponto mais próximo em uma rua
   */
  pontoMaisProximoNaRua(ponto: Coordenada, rua: Rua): Coordenada {
    let menorDistancia = Infinity;
    let pontoMaisProximo = rua.pontos[0];
    
    for (let i = 0; i < rua.pontos.length - 1; i++) {
      const inicio = rua.pontos[i];
      const fim = rua.pontos[i + 1];
      
      // Projeção do ponto na linha
      const A = ponto.lat - inicio.lat;
      const B = ponto.lng - inicio.lng;
      const C = fim.lat - inicio.lat;
      const D = fim.lng - inicio.lng;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = lenSq !== 0 ? dot / lenSq : -1;
      
      param = Math.max(0, Math.min(1, param));
      
      const projecao: Coordenada = {
        lat: inicio.lat + param * C,
        lng: inicio.lng + param * D,
      };
      
      const distancia = Math.sqrt(
        Math.pow(ponto.lat - projecao.lat, 2) + 
        Math.pow(ponto.lng - projecao.lng, 2)
      );
      
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        pontoMaisProximo = projecao;
      }
    }
    
    return pontoMaisProximo;
  },
  
  /**
   * Encontra árvores próximas a uma rota
   */
  encontrarArvoresProximas(rota: Coordenada[], obstaculos: Obstaculo[], distanciaMaxima: number = 5): Obstaculo[] {
    const arvores = obstaculos.filter(o => o.tipo === 'arvore');
    const arvoresProximas: Obstaculo[] = [];
    
    for (const arvore of arvores) {
      const pontoArvore = arvore.pontos[0];
      
      // Verificar distância a cada segmento da rota
      for (let i = 0; i < rota.length - 1; i++) {
        const distancia = this.distanciaPontoLinha(pontoArvore, rota[i], rota[i + 1]);
        
        if (distancia <= distanciaMaxima) {
          arvoresProximas.push(arvore);
          break; // Não precisa verificar outros segmentos
        }
      }
    }
    
    return arvoresProximas;
  },
};

export default osmService;
