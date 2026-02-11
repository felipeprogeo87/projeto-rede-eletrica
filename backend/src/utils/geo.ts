// =============================================================================
// Utilitários Geoespaciais
// =============================================================================
//
// Funções compartilhadas de cálculo de distância, ângulo e geometria.
// Centraliza a fórmula Haversine e outras operações geoespaciais
// que antes estavam duplicadas em múltiplos services.
//
// =============================================================================

export interface Coordenada {
  lat: number;
  lng: number;
}

/**
 * Calcula distância em metros entre dois pontos usando fórmula Haversine
 */
export function calcularDistanciaMetros(p1: Coordenada, p2: Coordenada): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Alias para manter compatibilidade com código existente
 */
export const calcularDistancia = calcularDistanciaMetros;

/**
 * Calcula distância de um ponto até o segmento mais próximo de uma polilinha
 */
export function distanciaPontoPolilinha(ponto: Coordenada, linha: Coordenada[]): number {
  let menorDistancia = Infinity;
  for (let i = 0; i < linha.length - 1; i++) {
    const dist = distanciaPontoSegmento(ponto, linha[i], linha[i + 1]);
    if (dist < menorDistancia) {
      menorDistancia = dist;
    }
  }
  return menorDistancia;
}

/**
 * Calcula distância de um ponto até um segmento de reta (projeção ortogonal)
 */
export function distanciaPontoSegmento(ponto: Coordenada, a: Coordenada, b: Coordenada): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return calcularDistanciaMetros(ponto, a);
  }

  let t = ((ponto.lng - a.lng) * dx + (ponto.lat - a.lat) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  const projecao: Coordenada = {
    lat: a.lat + t * dy,
    lng: a.lng + t * dx,
  };

  return calcularDistanciaMetros(ponto, projecao);
}

/**
 * Calcula ângulo de deflexão entre três pontos (em graus)
 */
export function calcularAnguloDeflexao(p1: Coordenada, p2: Coordenada, p3: Coordenada): number {
  const bearing1 = calcularBearing(p1, p2);
  const bearing2 = calcularBearing(p2, p3);
  let angulo = Math.abs(bearing2 - bearing1);
  if (angulo > 180) angulo = 360 - angulo;
  return angulo;
}

/**
 * Calcula bearing (azimute) entre dois pontos em graus
 */
export function calcularBearing(p1: Coordenada, p2: Coordenada): number {
  const dLon = (p2.lng - p1.lng) * Math.PI / 180;
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Calcula declive percentual entre dois pontos com elevação
 */
export function calcularDeclive(
  p1: Coordenada & { elevacao: number },
  p2: Coordenada & { elevacao: number }
): number {
  const distHorizontal = calcularDistanciaMetros(p1, p2);
  if (distHorizontal === 0) return 0;
  const desnivel = Math.abs(p2.elevacao - p1.elevacao);
  return (desnivel / distHorizontal) * 100;
}

/**
 * Interpola um ponto entre dois pontos dado uma fração (0 a 1)
 */
export function interpolarPonto(p1: Coordenada, p2: Coordenada, fracao: number): Coordenada {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * fracao,
    lng: p1.lng + (p2.lng - p1.lng) * fracao,
  };
}

/**
 * Calcula bounding box expandida para uma lista de coordenadas
 */
export function calcularBoundingBox(
  coords: Coordenada[],
  margemMetros: number = 200
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const margem = margemMetros / 111000; // ~111km por grau

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const c of coords) {
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLon) minLon = c.lng;
    if (c.lng > maxLon) maxLon = c.lng;
  }

  return {
    minLat: minLat - margem,
    maxLat: maxLat + margem,
    minLon: minLon - margem,
    maxLon: maxLon + margem,
  };
}
