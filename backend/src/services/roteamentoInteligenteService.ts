// =============================================================================
// Serviço: Roteamento Inteligente para Redes Elétricas
// =============================================================================
//
// Este serviço implementa lógica avançada de roteamento:
// - Detecta e trata travessias de avenidas (postes dos dois lados)
// - Identifica esquinas e prioriza posicionamento nelas
// - Evita passar sobre edificações (distância mínima de fachadas)
// - Considera regras específicas de projeto elétrico
//
// =============================================================================

import { Coordenada, Rua, Edificacao, Obstaculo, DadosTerreno } from './osmService';
import { calcularDistancia } from '../utils/geo';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface Esquina {
  id: string;
  coordenada: Coordenada;
  ruas: string[]; // nomes das ruas que se encontram
  angulo: number; // ângulo da esquina em graus
  prioridade: number; // 0-100, maior = melhor para poste
}

export interface Travessia {
  id: string;
  tipo: 'AVENIDA' | 'RODOVIA' | 'FERROVIA' | 'RIO';
  nome: string;
  pontoInicio: Coordenada; // onde começa a travessia
  pontoFim: Coordenada; // onde termina a travessia
  largura: number; // metros
  alturaMinima: number; // metros
  requerPostesDuplos: boolean; // poste antes e depois
}

export interface ZonaExclusao {
  id: string;
  tipo: 'EDIFICACAO' | 'AREA_PROTEGIDA' | 'PRACA' | 'MONUMENTO';
  poligono: Coordenada[];
  bufferMetros: number; // distância mínima a manter
  nome?: string;
}

export interface PontoPoste {
  coordenada: Coordenada;
  tipo: 'ESQUINA' | 'TRAVESSIA_ANTES' | 'TRAVESSIA_DEPOIS' | 'INTERMEDIARIO' | 'ORIGEM' | 'DESTINO';
  prioridade: number;
  justificativa: string;
  esquinaRef?: Esquina;
  travessiaRef?: Travessia;
}

export interface ResultadoRoteamentoInteligente {
  pontosPostes: PontoPoste[];
  esquinasDetectadas: Esquina[];
  travessiasDetectadas: Travessia[];
  zonasExclusao: ZonaExclusao[];
  rota: Coordenada[];
  estatisticas: {
    totalEsquinas: number;
    totalTravessias: number;
    totalZonasEvitadas: number;
    distanciaTotal: number;
    postesEmEsquinas: number;
    postesTravessia: number;
  };
}

// -----------------------------------------------------------------------------
// Configurações
// -----------------------------------------------------------------------------

const CONFIG = {
  // Distâncias mínimas (metros)
  DISTANCIA_MINIMA_FACHADA: 1.5, // distância mínima de edificações
  DISTANCIA_MINIMA_ESQUINA: 3.0, // distância do vértice da esquina
  BUFFER_BUSCA_ESQUINA: 15.0, // raio para considerar ponto como esquina
  
  // Travessias
  LARGURA_MINIMA_TRAVESSIA: 10.0, // considera travessia se via > 10m
  DISTANCIA_POSTE_TRAVESSIA: 5.0, // distância do poste à borda da via
  
  // Prioridades
  PRIORIDADE_ESQUINA: 80,
  PRIORIDADE_TRAVESSIA: 90,
  PRIORIDADE_INTERMEDIARIO: 50,
  
  // Tipos de vias que requerem travessia especial
  VIAS_TRAVESSIA_ESPECIAL: ['trunk', 'motorway', 'primary', 'trunk_link', 'motorway_link'],
  VIAS_AVENIDA: ['primary', 'secondary', 'tertiary'],
};

// -----------------------------------------------------------------------------
// Funções Auxiliares de Geometria
// -----------------------------------------------------------------------------

/**
 * Calcula ângulo entre três pontos
 */
function calcularAngulo(p1: Coordenada, centro: Coordenada, p2: Coordenada): number {
  const v1 = { x: p1.lat - centro.lat, y: p1.lng - centro.lng };
  const v2 = { x: p2.lat - centro.lat, y: p2.lng - centro.lng };
  
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  
  let angulo = Math.atan2(cross, dot) * (180 / Math.PI);
  if (angulo < 0) angulo += 360;
  
  return angulo;
}

/**
 * Verifica se um ponto está dentro de um polígono
 */
function pontoEmPoligono(ponto: Coordenada, poligono: Coordenada[]): boolean {
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
 * Calcula distância mínima de um ponto a um polígono
 */
function distanciaAPoligono(ponto: Coordenada, poligono: Coordenada[]): number {
  let minDist = Infinity;
  
  for (let i = 0; i < poligono.length; i++) {
    const j = (i + 1) % poligono.length;
    const dist = distanciaPontoSegmento(ponto, poligono[i], poligono[j]);
    minDist = Math.min(minDist, dist);
  }
  
  return minDist;
}

/**
 * Distância de um ponto a um segmento de linha
 */
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

/**
 * Encontra interseção de dois segmentos
 */
function intersecaoSegmentos(
  p1: Coordenada, p2: Coordenada,
  p3: Coordenada, p4: Coordenada
): Coordenada | null {
  const d1 = (p4.lng - p3.lng) * (p1.lat - p3.lat) - (p4.lat - p3.lat) * (p1.lng - p3.lng);
  const d2 = (p4.lng - p3.lng) * (p2.lat - p1.lat) - (p4.lat - p3.lat) * (p2.lng - p1.lng);
  const d3 = (p2.lng - p1.lng) * (p1.lat - p3.lat) - (p2.lat - p1.lat) * (p1.lng - p3.lng);

  if (Math.abs(d2) < 1e-10) return null;

  const ua = d1 / d2;
  const ub = d3 / d2;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      lat: p1.lat + ua * (p2.lat - p1.lat),
      lng: p1.lng + ua * (p2.lng - p1.lng),
    };
  }

  return null;
}

/**
 * Expande polígono por um buffer (simplificado)
 */
function expandirPoligono(poligono: Coordenada[], bufferMetros: number): Coordenada[] {
  if (poligono.length < 3) return poligono;
  
  // Calcular centroide
  const centroide: Coordenada = {
    lat: poligono.reduce((s, p) => s + p.lat, 0) / poligono.length,
    lng: poligono.reduce((s, p) => s + p.lng, 0) / poligono.length,
  };
  
  // Expandir cada ponto para fora do centroide
  const bufferGraus = bufferMetros / 111000;
  
  return poligono.map(p => {
    const dx = p.lat - centroide.lat;
    const dy = p.lng - centroide.lng;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1e-10) return p;
    
    const fator = (dist + bufferGraus) / dist;
    return {
      lat: centroide.lat + dx * fator,
      lng: centroide.lng + dy * fator,
    };
  });
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const roteamentoInteligenteService = {
  /**
   * Analisa rota e determina pontos ideais para postes
   */
  async analisarRota(
    rota: Coordenada[],
    dadosTerreno: DadosTerreno,
    vaoIdeal: number,
    vaoMaximo: number,
    vaoMinimo: number
  ): Promise<ResultadoRoteamentoInteligente> {
    console.log('[ROTEAMENTO INTELIGENTE] Iniciando análise...');
    
    // 1. Detectar esquinas ao longo da rota
    const esquinas = this.detectarEsquinas(rota, dadosTerreno.ruas);
    console.log(`  Esquinas detectadas: ${esquinas.length}`);
    
    // 2. Detectar travessias (avenidas, rodovias)
    const travessias = this.detectarTravessias(rota, dadosTerreno.ruas, dadosTerreno.obstaculos);
    console.log(`  Travessias detectadas: ${travessias.length}`);
    
    // 3. Criar zonas de exclusão (edificações + buffer)
    const zonasExclusao = this.criarZonasExclusao(dadosTerreno.edificacoes);
    console.log(`  Zonas de exclusão: ${zonasExclusao.length}`);
    
    // 4. Posicionar postes considerando tudo
    const pontosPostes = this.posicionarPostesInteligente(
      rota,
      esquinas,
      travessias,
      zonasExclusao,
      vaoIdeal,
      vaoMaximo,
      vaoMinimo
    );
    console.log(`  Postes posicionados: ${pontosPostes.length}`);
    
    // 5. Validar posicionamento (nenhum sobre edificação)
    const pontosValidados = this.validarPosicionamento(pontosPostes, zonasExclusao);
    
    // Estatísticas
    const estatisticas = {
      totalEsquinas: esquinas.length,
      totalTravessias: travessias.length,
      totalZonasEvitadas: zonasExclusao.length,
      distanciaTotal: this.calcularDistanciaTotal(rota),
      postesEmEsquinas: pontosValidados.filter(p => p.tipo === 'ESQUINA').length,
      postesTravessia: pontosValidados.filter(p => p.tipo.startsWith('TRAVESSIA')).length,
    };
    
    console.log(`[ROTEAMENTO INTELIGENTE] Concluído: ${pontosValidados.length} postes`);
    
    return {
      pontosPostes: pontosValidados,
      esquinasDetectadas: esquinas,
      travessiasDetectadas: travessias,
      zonasExclusao,
      rota,
      estatisticas,
    };
  },

  /**
   * Detecta esquinas ao longo da rota
   */
  detectarEsquinas(rota: Coordenada[], ruas: Rua[]): Esquina[] {
    const esquinas: Esquina[] = [];
    const esquinasMap = new Map<string, Esquina>();
    
    // Para cada par de ruas, encontrar interseções
    for (let i = 0; i < ruas.length; i++) {
      for (let j = i + 1; j < ruas.length; j++) {
        const rua1 = ruas[i];
        const rua2 = ruas[j];
        
        // Verificar cada segmento
        for (let a = 0; a < rua1.pontos.length - 1; a++) {
          for (let b = 0; b < rua2.pontos.length - 1; b++) {
            const intersecao = intersecaoSegmentos(
              rua1.pontos[a], rua1.pontos[a + 1],
              rua2.pontos[b], rua2.pontos[b + 1]
            );
            
            if (intersecao) {
              // Verificar se está próximo da rota
              const distRota = this.distanciaMinimaARota(intersecao, rota);
              
              if (distRota <= CONFIG.BUFFER_BUSCA_ESQUINA) {
                const key = `${intersecao.lat.toFixed(6)}_${intersecao.lng.toFixed(6)}`;
                
                if (!esquinasMap.has(key)) {
                  // Calcular ângulo da esquina
                  const angulo = calcularAngulo(
                    rua1.pontos[a],
                    intersecao,
                    rua2.pontos[b]
                  );
                  
                  // Prioridade: esquinas de ~90° são melhores
                  const desvio90 = Math.abs(90 - Math.abs(angulo - 180));
                  const prioridade = CONFIG.PRIORIDADE_ESQUINA - desvio90 / 2;
                  
                  esquinasMap.set(key, {
                    id: `ESQ_${esquinasMap.size + 1}`,
                    coordenada: intersecao,
                    ruas: [rua1.nome, rua2.nome],
                    angulo,
                    prioridade,
                  });
                }
              }
            }
          }
        }
      }
    }
    
    return Array.from(esquinasMap.values());
  },

  /**
   * Detecta travessias de vias principais
   */
  detectarTravessias(rota: Coordenada[], ruas: Rua[], obstaculos: Obstaculo[]): Travessia[] {
    const travessias: Travessia[] = [];
    
    // Verificar ruas que são avenidas/rodovias
    const viasImportantes = ruas.filter(r => 
      CONFIG.VIAS_TRAVESSIA_ESPECIAL.includes(r.tipo) ||
      CONFIG.VIAS_AVENIDA.includes(r.tipo)
    );
    
    // Para cada segmento da rota
    for (let i = 0; i < rota.length - 1; i++) {
      const p1 = rota[i];
      const p2 = rota[i + 1];
      
      // Verificar cruzamento com vias importantes
      for (const via of viasImportantes) {
        for (let j = 0; j < via.pontos.length - 1; j++) {
          const intersecao = intersecaoSegmentos(
            p1, p2,
            via.pontos[j], via.pontos[j + 1]
          );
          
          if (intersecao) {
            const largura = via.largura || (CONFIG.VIAS_TRAVESSIA_ESPECIAL.includes(via.tipo) ? 20 : 12);
            const alturaMinima = CONFIG.VIAS_TRAVESSIA_ESPECIAL.includes(via.tipo) ? 7 : 6;

            // Calcular pontos antes e depois da travessia
            const direcao = {
              lat: p2.lat - p1.lat,
              lng: p2.lng - p1.lng,
            };
            const distDir = Math.sqrt(direcao.lat ** 2 + direcao.lng ** 2);
            if (distDir < 1e-10) continue; // Pontos coincidentes, pular
            const offsetGraus = (largura / 2 + CONFIG.DISTANCIA_POSTE_TRAVESSIA) / 111000;

            const pontoInicio: Coordenada = {
              lat: intersecao.lat - (direcao.lat / distDir) * offsetGraus,
              lng: intersecao.lng - (direcao.lng / distDir) * offsetGraus,
            };

            const pontoFim: Coordenada = {
              lat: intersecao.lat + (direcao.lat / distDir) * offsetGraus,
              lng: intersecao.lng + (direcao.lng / distDir) * offsetGraus,
            };
            
            travessias.push({
              id: `TRAV_${travessias.length + 1}`,
              tipo: CONFIG.VIAS_TRAVESSIA_ESPECIAL.includes(via.tipo) ? 'RODOVIA' : 'AVENIDA',
              nome: via.nome,
              pontoInicio,
              pontoFim,
              largura,
              alturaMinima,
              requerPostesDuplos: true,
            });
          }
        }
      }
    }
    
    // Adicionar obstáculos (rios, ferrovias)
    for (const obs of obstaculos) {
      if (obs.tipo === 'ferrovia' || obs.tipo === 'rio') {
        for (let i = 0; i < rota.length - 1; i++) {
          for (let j = 0; j < obs.pontos.length - 1; j++) {
            const intersecao = intersecaoSegmentos(
              rota[i], rota[i + 1],
              obs.pontos[j], obs.pontos[j + 1]
            );
            
            if (intersecao) {
              const largura = obs.tipo === 'ferrovia' ? 15 : 20;
              const offsetGraus = (largura / 2 + 5) / 111000;

              const direcao = {
                lat: rota[i + 1].lat - rota[i].lat,
                lng: rota[i + 1].lng - rota[i].lng,
              };
              const distDir = Math.sqrt(direcao.lat ** 2 + direcao.lng ** 2);
              if (distDir < 1e-10) continue; // Pontos coincidentes, pular

              travessias.push({
                id: `TRAV_${travessias.length + 1}`,
                tipo: obs.tipo === 'ferrovia' ? 'FERROVIA' : 'RIO',
                nome: obs.nome || obs.tipo,
                pontoInicio: {
                  lat: intersecao.lat - (direcao.lat / distDir) * offsetGraus,
                  lng: intersecao.lng - (direcao.lng / distDir) * offsetGraus,
                },
                pontoFim: {
                  lat: intersecao.lat + (direcao.lat / distDir) * offsetGraus,
                  lng: intersecao.lng + (direcao.lng / distDir) * offsetGraus,
                },
                largura,
                alturaMinima: obs.tipo === 'ferrovia' ? 9 : 6,
                requerPostesDuplos: true,
              });
            }
          }
        }
      }
    }
    
    return travessias;
  },

  /**
   * Cria zonas de exclusão a partir das edificações
   */
  criarZonasExclusao(edificacoes: Edificacao[]): ZonaExclusao[] {
    return edificacoes.map((edif, index) => ({
      id: `ZONA_${index + 1}`,
      tipo: 'EDIFICACAO' as const,
      poligono: edif.pontos,
      bufferMetros: CONFIG.DISTANCIA_MINIMA_FACHADA,
      nome: edif.nome,
    }));
  },

  /**
   * Posiciona postes de forma inteligente
   */
  posicionarPostesInteligente(
    rota: Coordenada[],
    esquinas: Esquina[],
    travessias: Travessia[],
    zonasExclusao: ZonaExclusao[],
    vaoIdeal: number,
    vaoMaximo: number,
    vaoMinimo: number
  ): PontoPoste[] {
    const pontosPostes: PontoPoste[] = [];
    
    // 1. Adicionar origem
    pontosPostes.push({
      coordenada: rota[0],
      tipo: 'ORIGEM',
      prioridade: 100,
      justificativa: 'Ponto de origem da rede',
    });
    
    // 2. Adicionar postes de travessia (obrigatórios)
    for (const trav of travessias) {
      pontosPostes.push({
        coordenada: trav.pontoInicio,
        tipo: 'TRAVESSIA_ANTES',
        prioridade: CONFIG.PRIORIDADE_TRAVESSIA,
        justificativa: `Poste antes da travessia: ${trav.nome}`,
        travessiaRef: trav,
      });
      
      pontosPostes.push({
        coordenada: trav.pontoFim,
        tipo: 'TRAVESSIA_DEPOIS',
        prioridade: CONFIG.PRIORIDADE_TRAVESSIA,
        justificativa: `Poste após a travessia: ${trav.nome}`,
        travessiaRef: trav,
      });
    }
    
    // 3. Adicionar destino
    pontosPostes.push({
      coordenada: rota[rota.length - 1],
      tipo: 'DESTINO',
      prioridade: 100,
      justificativa: 'Ponto de destino da rede',
    });
    
    // 4. Ordenar por posição na rota
    pontosPostes.sort((a, b) => {
      const distA = this.distanciaAoLongoDaRota(rota[0], a.coordenada, rota);
      const distB = this.distanciaAoLongoDaRota(rota[0], b.coordenada, rota);
      return distA - distB;
    });
    
    // 5. Preencher lacunas com postes intermediários (priorizando esquinas)
    const postesFinais: PontoPoste[] = [];
    
    for (let i = 0; i < pontosPostes.length; i++) {
      postesFinais.push(pontosPostes[i]);
      
      if (i < pontosPostes.length - 1) {
        const atual = pontosPostes[i];
        const proximo = pontosPostes[i + 1];
        const distancia = calcularDistancia(atual.coordenada, proximo.coordenada);
        
        if (distancia > vaoMaximo) {
          // Precisa de postes intermediários
          const numPostes = Math.ceil(distancia / vaoIdeal) - 1;
          
          for (let j = 1; j <= numPostes; j++) {
            const fator = j / (numPostes + 1);
            const pontoBase: Coordenada = {
              lat: atual.coordenada.lat + (proximo.coordenada.lat - atual.coordenada.lat) * fator,
              lng: atual.coordenada.lng + (proximo.coordenada.lng - atual.coordenada.lng) * fator,
            };
            
            // Verificar se há esquina próxima
            const esquinaProxima = this.encontrarEsquinaProxima(pontoBase, esquinas, vaoIdeal / 2);
            
            if (esquinaProxima) {
              // Usar esquina como ponto do poste
              postesFinais.push({
                coordenada: esquinaProxima.coordenada,
                tipo: 'ESQUINA',
                prioridade: esquinaProxima.prioridade,
                justificativa: `Esquina: ${esquinaProxima.ruas.join(' x ')}`,
                esquinaRef: esquinaProxima,
              });
            } else {
              // Usar ponto intermediário
              const pontoAjustado = this.ajustarParaRua(pontoBase, rota);
              
              postesFinais.push({
                coordenada: pontoAjustado,
                tipo: 'INTERMEDIARIO',
                prioridade: CONFIG.PRIORIDADE_INTERMEDIARIO,
                justificativa: 'Poste intermediário para respeitar vão máximo',
              });
            }
          }
        }
      }
    }
    
    // 6. Validação final: garantir que nenhum vão excede o máximo
    //    (esquinas podem ter sido deslocadas, gerando vãos maiores que o esperado)
    let precisaRevalidar = true;
    let iteracoes = 0;
    const MAX_ITERACOES = 10; // safety: evitar loop infinito

    while (precisaRevalidar && iteracoes < MAX_ITERACOES) {
      precisaRevalidar = false;
      iteracoes++;
      const postesExtras: { index: number; ponto: PontoPoste }[] = [];

      for (let i = 0; i < postesFinais.length - 1; i++) {
        const dist = calcularDistancia(postesFinais[i].coordenada, postesFinais[i + 1].coordenada);
        if (dist > vaoMaximo) {
          // Inserir poste intermediário no ponto médio ajustado à rota
          const meio: Coordenada = {
            lat: (postesFinais[i].coordenada.lat + postesFinais[i + 1].coordenada.lat) / 2,
            lng: (postesFinais[i].coordenada.lng + postesFinais[i + 1].coordenada.lng) / 2,
          };
          const pontoAjustado = this.ajustarParaRua(meio, rota);

          postesExtras.push({
            index: i + 1,
            ponto: {
              coordenada: pontoAjustado,
              tipo: 'INTERMEDIARIO',
              prioridade: CONFIG.PRIORIDADE_INTERMEDIARIO,
              justificativa: 'Poste intermediário para respeitar vão máximo',
            },
          });
          precisaRevalidar = true;
        }
      }

      // Inserir de trás para frente para manter índices corretos
      for (let k = postesExtras.length - 1; k >= 0; k--) {
        postesFinais.splice(postesExtras[k].index, 0, postesExtras[k].ponto);
      }
    }

    return postesFinais;
  },

  /**
   * Valida posicionamento dos postes (não podem estar sobre edificações)
   */
  validarPosicionamento(pontosPostes: PontoPoste[], zonasExclusao: ZonaExclusao[]): PontoPoste[] {
    return pontosPostes.map(ponto => {
      let coordenadaFinal = ponto.coordenada;
      let ajustado = false;
      
      for (const zona of zonasExclusao) {
        // Verificar se está dentro da zona expandida
        const poligonoExpandido = expandirPoligono(zona.poligono, zona.bufferMetros);
        
        if (pontoEmPoligono(ponto.coordenada, poligonoExpandido)) {
          // Mover para fora da zona
          coordenadaFinal = this.moverParaForaZona(ponto.coordenada, zona);
          ajustado = true;
          break;
        }
      }
      
      if (ajustado) {
        return {
          ...ponto,
          coordenada: coordenadaFinal,
          justificativa: ponto.justificativa + ' (ajustado para evitar edificação)',
        };
      }
      
      return ponto;
    });
  },

  /**
   * Move um ponto para fora de uma zona de exclusão
   */
  moverParaForaZona(ponto: Coordenada, zona: ZonaExclusao): Coordenada {
    // Calcular centroide da zona
    const centroide: Coordenada = {
      lat: zona.poligono.reduce((s, p) => s + p.lat, 0) / zona.poligono.length,
      lng: zona.poligono.reduce((s, p) => s + p.lng, 0) / zona.poligono.length,
    };
    
    // Direção para fora
    const dx = ponto.lat - centroide.lat;
    const dy = ponto.lng - centroide.lng;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 1e-10) {
      // Ponto no centro, mover para norte
      return {
        lat: ponto.lat + (zona.bufferMetros + 2) / 111000,
        lng: ponto.lng,
      };
    }
    
    // Mover na direção oposta ao centro
    const fator = (zona.bufferMetros + 2) / 111000 / dist;
    
    return {
      lat: ponto.lat + dx * fator,
      lng: ponto.lng + dy * fator,
    };
  },

  /**
   * Encontra esquina mais próxima dentro de um raio
   */
  encontrarEsquinaProxima(ponto: Coordenada, esquinas: Esquina[], raioMaximo: number): Esquina | null {
    let melhorEsquina: Esquina | null = null;
    let menorDistancia = raioMaximo;
    
    for (const esquina of esquinas) {
      const dist = calcularDistancia(ponto, esquina.coordenada);
      if (dist < menorDistancia) {
        menorDistancia = dist;
        melhorEsquina = esquina;
      }
    }
    
    return melhorEsquina;
  },

  /**
   * Ajusta ponto para ficar sobre a rua mais próxima
   */
  ajustarParaRua(ponto: Coordenada, rota: Coordenada[]): Coordenada {
    let menorDist = Infinity;
    let pontoMaisProximo = ponto;
    
    for (let i = 0; i < rota.length - 1; i++) {
      const p1 = rota[i];
      const p2 = rota[i + 1];
      
      // Projetar ponto no segmento
      const A = ponto.lat - p1.lat;
      const B = ponto.lng - p1.lng;
      const C = p2.lat - p1.lat;
      const D = p2.lng - p1.lng;
      
      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = lenSq !== 0 ? dot / lenSq : -1;
      param = Math.max(0, Math.min(1, param));
      
      const projecao: Coordenada = {
        lat: p1.lat + param * C,
        lng: p1.lng + param * D,
      };
      
      const dist = calcularDistancia(ponto, projecao);
      if (dist < menorDist) {
        menorDist = dist;
        pontoMaisProximo = projecao;
      }
    }
    
    return pontoMaisProximo;
  },

  /**
   * Calcula distância mínima de um ponto à rota
   */
  distanciaMinimaARota(ponto: Coordenada, rota: Coordenada[]): number {
    let minDist = Infinity;
    
    for (let i = 0; i < rota.length - 1; i++) {
      const dist = distanciaPontoSegmento(ponto, rota[i], rota[i + 1]);
      minDist = Math.min(minDist, dist);
    }
    
    return minDist;
  },

  /**
   * Calcula distância ao longo da rota
   */
  distanciaAoLongoDaRota(origem: Coordenada, ponto: Coordenada, rota: Coordenada[]): number {
    let distanciaAcumulada = 0;
    let menorDistPonto = Infinity;
    let distanciaAtePonto = 0;
    
    for (let i = 0; i < rota.length - 1; i++) {
      const distSegmento = calcularDistancia(rota[i], rota[i + 1]);
      const distPontoSegmento = distanciaPontoSegmento(ponto, rota[i], rota[i + 1]);
      
      if (distPontoSegmento < menorDistPonto) {
        menorDistPonto = distPontoSegmento;
        // Estimar posição no segmento
        const distAteInicio = calcularDistancia(rota[i], ponto);
        distanciaAtePonto = distanciaAcumulada + Math.min(distAteInicio, distSegmento);
      }
      
      distanciaAcumulada += distSegmento;
    }
    
    return distanciaAtePonto;
  },

  /**
   * Calcula distância total da rota
   */
  calcularDistanciaTotal(rota: Coordenada[]): number {
    let total = 0;
    for (let i = 1; i < rota.length; i++) {
      total += calcularDistancia(rota[i - 1], rota[i]);
    }
    return total;
  },
};

export default roteamentoInteligenteService;
