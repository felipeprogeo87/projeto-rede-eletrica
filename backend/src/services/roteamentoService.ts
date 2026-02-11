// =============================================================================
// Serviço: Roteamento (Pathfinding seguindo ruas via OSRM)
// =============================================================================
//
// Este serviço calcula o melhor caminho entre origem e destino usando OSRM:
// 1. Chama API do OSRM (Open Source Routing Machine) para obter rota real
// 2. OSRM retorna geometria completa seguindo as ruas
// 3. Opcionalmente aplica grid de custos para penalizar áreas difíceis
//
// OSRM é mais preciso que construir grafo próprio do OSM porque:
// - Considera sentido das vias, restrições de conversão
// - Otimizado para roteamento veicular
// - Retorna rota completa com todos os pontos das ruas
//
// =============================================================================

import { Coordenada } from './osmService';
import { GridCustos, terrenoService } from './terrenoService';
import { calcularDistancia } from '../utils/geo';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

interface OpcoesRoteamento {
  gridCustos?: GridCustos;  // Grid de custos opcional para ajustes
}

interface ResultadoRota {
  sucesso: boolean;
  pontos: Coordenada[];
  distanciaTotal: number;
  ruasUtilizadas: string[];
}

interface OSRMResponse {
  code: string;
  routes: {
    geometry: {
      coordinates: [number, number][]; // [lng, lat]
      type: string;
    };
    distance: number;
    duration: number;
  }[];
  waypoints: {
    name: string;
    location: [number, number];
  }[];
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const roteamentoService = {
  /**
   * Calcula rota seguindo as ruas entre origem e destino usando OSRM
   */
  async calcularRota(
    origem: Coordenada,
    destino: Coordenada,
    opcoes?: OpcoesRoteamento
  ): Promise<ResultadoRota> {
    console.log('[ROTA] Calculando rota via OSRM...');
    console.log(`[ROTA] Origem: ${origem.lat.toFixed(6)}, ${origem.lng.toFixed(6)}`);
    console.log(`[ROTA] Destino: ${destino.lat.toFixed(6)}, ${destino.lng.toFixed(6)}`);

    try {
      // 1. Chamar OSRM para obter rota
      const rotaOSRM = await this.chamarOSRM(origem, destino);

      if (!rotaOSRM || rotaOSRM.length < 2) {
        console.warn('[ROTA] OSRM não retornou rota válida, usando linha reta');
        return this.rotaLinhaReta(origem, destino);
      }

      console.log(`[ROTA] OSRM retornou ${rotaOSRM.length} pontos`);

      // 2. Se tiver grid de custos, verificar se há obstáculos críticos na rota
      const gridCustos = opcoes?.gridCustos;
      let pontosFinais = rotaOSRM;

      if (gridCustos) {
        console.log(`[ROTA] Verificando custos do terreno...`);
        pontosFinais = this.ajustarRotaComCustos(rotaOSRM, gridCustos);
      }

      // 3. Calcular distância total
      let distanciaTotal = 0;
      for (let i = 0; i < pontosFinais.length - 1; i++) {
        distanciaTotal += calcularDistancia(pontosFinais[i], pontosFinais[i + 1]);
      }

      console.log(`[ROTA] Rota final: ${pontosFinais.length} pontos, ${distanciaTotal.toFixed(0)}m`);

      return {
        sucesso: true,
        pontos: pontosFinais,
        distanciaTotal,
        ruasUtilizadas: [],
      };

    } catch (error: any) {
      console.error('[ROTA] Erro:', error.message);
      return this.rotaLinhaReta(origem, destino);
    }
  },

  /**
   * Chama API do OSRM para obter rota
   */
  async chamarOSRM(origem: Coordenada, destino: Coordenada): Promise<Coordenada[]> {
    // OSRM espera coordenadas no formato lng,lat
    const url = `http://router.project-osrm.org/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`;

    console.log(`[ROTA] Chamando OSRM: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ProjetoRedeEletrica/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`OSRM retornou status ${response.status}`);
    }

    const data = await response.json() as OSRMResponse;

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(`OSRM não encontrou rota: ${data.code}`);
    }

    const rota = data.routes[0];
    const coordenadas = rota.geometry.coordinates;

    // Converter de [lng, lat] para {lat, lng}
    const pontos: Coordenada[] = coordenadas.map(([lng, lat]) => ({
      lat,
      lng,
    }));

    // Log das ruas encontradas
    if (data.waypoints) {
      const ruas = data.waypoints.map(w => w.name).filter(n => n);
      if (ruas.length > 0) {
        console.log(`[ROTA] Ruas: ${ruas.join(' → ')}`);
      }
    }

    return pontos;
  },

  /**
   * Ajusta rota considerando custos do terreno
   * Remove ou marca pontos em áreas de alto custo
   */
  ajustarRotaComCustos(pontos: Coordenada[], gridCustos: GridCustos): Coordenada[] {
    // Por enquanto, apenas verifica custos mas mantém a rota OSRM
    // O OSRM já segue as ruas, então a rota é geralmente válida
    
    let custosAltos = 0;
    
    for (const ponto of pontos) {
      const custo = terrenoService.getCusto(gridCustos, ponto);
      if (custo > 5) { // Custo alto (obstáculo, edificação, etc)
        custosAltos++;
      }
    }

    if (custosAltos > 0) {
      console.log(`[ROTA] ${custosAltos} pontos em áreas de alto custo (mas seguindo ruas)`);
    }

    // Retorna rota original do OSRM
    // Em versão futura, poderia tentar rotas alternativas
    return pontos;
  },

  /**
   * Fallback: rota em linha reta
   */
  rotaLinhaReta(origem: Coordenada, destino: Coordenada): ResultadoRota {
    const distancia = calcularDistancia(origem, destino);
    
    console.log(`[ROTA] Usando linha reta: ${distancia.toFixed(0)}m`);

    return {
      sucesso: true,
      pontos: [origem, destino],
      distanciaTotal: distancia,
      ruasUtilizadas: [],
    };
  },

  /**
   * Simplifica rota removendo pontos muito próximos
   * Útil para reduzir número de postes em trechos retos
   */
  simplificarRota(pontos: Coordenada[], distanciaMinima: number = 5): Coordenada[] {
    if (pontos.length <= 2) return pontos;

    const resultado: Coordenada[] = [pontos[0]];

    for (let i = 1; i < pontos.length - 1; i++) {
      const ultimo = resultado[resultado.length - 1];
      const atual = pontos[i];
      const distancia = calcularDistancia(ultimo, atual);

      // Mantém ponto se distância suficiente do último
      if (distancia >= distanciaMinima) {
        resultado.push(atual);
      }
    }

    // Sempre inclui último ponto
    resultado.push(pontos[pontos.length - 1]);

    return resultado;
  },

  /**
   * Densifica rota adicionando pontos intermediários
   * Útil para garantir postes em intervalos regulares
   */
  densificarRota(pontos: Coordenada[], intervaloMaximo: number = 50): Coordenada[] {
    if (pontos.length < 2) return pontos;

    const resultado: Coordenada[] = [pontos[0]];

    for (let i = 1; i < pontos.length; i++) {
      const anterior = pontos[i - 1];
      const atual = pontos[i];
      const distancia = calcularDistancia(anterior, atual);

      if (distancia > intervaloMaximo) {
        // Adiciona pontos intermediários
        const numPontos = Math.ceil(distancia / intervaloMaximo);
        
        for (let j = 1; j < numPontos; j++) {
          const t = j / numPontos;
          resultado.push({
            lat: anterior.lat + t * (atual.lat - anterior.lat),
            lng: anterior.lng + t * (atual.lng - anterior.lng),
          });
        }
      }

      resultado.push(atual);
    }

    return resultado;
  },
};

export default roteamentoService;
