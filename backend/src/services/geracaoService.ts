// =============================================================================
// Serviço: Geração Automática de Projeto (ORQUESTRADOR COMPLETO)
// =============================================================================
//
// Pipeline de 10 etapas com WebSocket em tempo real:
// ETAPA 1: Coleta de dados da OS
// ETAPA 2: Consulta OSM (ruas, edificações, obstáculos, árvores)
// ETAPA 3: Consulta Google Maps (barreiras adicionais)
// ETAPA 4: Consulta IBGE/ANEEL (dados do município)
// ETAPA 5: Cálculo de elevação (SRTM)
// ETAPA 6: Classificação de área (URBANA/RURAL)
// ETAPA 7: Roteamento inteligente (OSRM + esquinas + travessias)
// ETAPA 8: Posicionamento de postes (evitando edificações)
// ETAPA 9: Validação e detecção de barreiras
// ETAPA 10: Geração de saídas (materiais, DXF)
//
// =============================================================================

import pool from '../db';
import { calcularDistancia, calcularAnguloDeflexao } from '../utils/geo';
import { osmService, Coordenada, DadosTerreno, BoundingBox } from './osmService';
import { roteamentoService } from './roteamentoService';
import { roteamentoInteligenteService, PontoPoste } from './roteamentoInteligenteService';
import { elevacaoService, PerfilAltimetrico } from './elevacaoService';
import { terrenoService, GridCustos } from './terrenoService';
import { barreirasService, RelatorioBarreiras, PosteGerado } from './barreirasService';
import { googleMapsService } from './googleMapsService';
import { areaClassifierService, TipoArea, ClassificacaoArea } from './areaClassifierService';
import { fontesExternasService } from './fontesExternasService';
import { regrasEquatorialService, ConfigProjeto, FuncaoPoste } from './regrasEquatorialService';
import { materiaisService, ListaMateriais, PosteComEquipamentos, CondutorGerado } from './materiaisService';
import { dxfService } from './dxfService';
import { wsManager } from './wsManager';

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

export interface ConfigGeracao {
  tipo_rede: 'mt_convencional' | 'mt_compacta' | 'bt_multiplexada' | 'bt_convencional';
  distribuidora: string;
  natureza?: 'MONOFASICA' | 'BIFASICA' | 'TRIFASICA';
  tensao_mt?: number;
  tensao_bt?: number;
  condutor_mt?: string;
  condutor_bt?: string;
  com_bt?: boolean;
  zona_corrosao?: 'NORMAL' | 'P1' | 'P2';
  trafo_kva?: number;
  trafo_posicao?: number;
  tipo_area_forcado?: 'URBANA' | 'RURAL';
  usar_google_maps?: boolean;
  usar_ibge?: boolean;
}

export interface ResultadoGeracao {
  sucesso: boolean;
  postes: PosteComEquipamentos[];
  condutores: CondutorGerado[];
  barreiras: RelatorioBarreiras;
  materiais: ListaMateriais;
  dxf: string;
  perfil: PerfilAltimetrico;
  resumo: {
    total_postes: number;
    total_condutores: number;
    extensao_mt: number;
    extensao_bt: number;
    erros: number;
    avisos: number;
    metodo: 'osrm' | 'osm' | 'linha_reta';
    tipo_area: TipoArea;
    vao_utilizado: number;
    esquinas_utilizadas: number;
    travessias_detectadas: number;
  };
  validacao_detalhes?: {
    erros: ErroValidacao[];
    avisos: AvisoValidacao[];
  };
  classificacao_area?: ClassificacaoArea;
  dados_ibge?: any;
  dados_aneel?: any;
}

export interface ErroValidacao {
  id: string;
  tipo: 'ERRO';
  categoria: string;
  mensagem: string;
  detalhe?: string;
  localizacao?: { lat: number; lng: number; posteId?: string };
  sugestao?: string;
  regra?: string;
}

export interface AvisoValidacao {
  id: string;
  tipo: 'AVISO';
  categoria: string;
  mensagem: string;
  detalhe?: string;
  localizacao?: { lat: number; lng: number; posteId?: string };
  sugestao?: string;
  regra?: string;
}

// -----------------------------------------------------------------------------
// Funções Auxiliares
// -----------------------------------------------------------------------------

function montarConfigProjeto(config: ConfigGeracao | undefined, estado: string, tipoArea: TipoArea): ConfigProjeto {
  const cfg = config || ({} as ConfigGeracao);
  const tipoRedeStr = cfg.tipo_rede || 'mt_convencional';
  const tipoRede = tipoRedeStr.startsWith('mt_compacta') ? 'COMPACTA' : 'CONVENCIONAL';

  return {
    distribuidora: 'EQUATORIAL',
    estado: estado || 'MA',
    tipoArea,
    zonaCorrosao: cfg.zona_corrosao || 'NORMAL',
    tipoRede,
    natureza: cfg.natureza || 'TRIFASICA',
    tensaoMT: cfg.tensao_mt || 13.8,
    tensaoBT: cfg.tensao_bt || 380,
    condutorMT: cfg.condutor_mt || '1/0 AWG',
    condutorBT: cfg.condutor_bt || '35(35)',
    comBT: cfg.com_bt ?? true,
  };
}

function determinarFuncaoPoste(
  index: number,
  total: number,
  anguloDeflexao: number,
  temTrafo: boolean,
  temChave: boolean,
  tipoPonto?: string
): FuncaoPoste {
  if (temTrafo) return 'EQUIPAMENTO';
  if (temChave) return 'DERIVACAO';
  if (index === 0) return 'ANCORAGEM';
  if (index === total - 1) return 'FIM';
  if (tipoPonto === 'TRAVESSIA_ANTES' || tipoPonto === 'TRAVESSIA_DEPOIS') return 'ANCORAGEM';
  if (anguloDeflexao > 15) return 'ANGULO';
  return 'TANGENTE';
}

// Medir tempo de execução
async function medirTempo<T>(fn: () => Promise<T>): Promise<{ resultado: T; tempoMs: number }> {
  const inicio = Date.now();
  const resultado = await fn();
  return { resultado, tempoMs: Date.now() - inicio };
}

// -----------------------------------------------------------------------------
// Serviço Principal
// -----------------------------------------------------------------------------

export const geracaoService = {
  /**
   * Gera projeto completo com WebSocket em tempo real
   */
  async gerarProjeto(osId: number, config: ConfigGeracao): Promise<ResultadoGeracao> {
    const ws = wsManager;
    let progressoAtual = 0;
    const totalEtapas = 10;

    const atualizarProgresso = (etapa: number) => {
      progressoAtual = Math.round((etapa / totalEtapas) * 100);
      ws.progressoGeral(osId, progressoAtual);
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[GERAÇÃO] Iniciando projeto para OS ${osId}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      // =====================================================================
      // ETAPA 1: Buscar dados da OS
      // =====================================================================
      ws.etapaInicio(osId, 'dados_os', 'Carregando dados da OS');
      
      const { resultado: os, tempoMs: tempoOS } = await medirTempo(async () => {
        const result = await pool.query('SELECT * FROM ordem_servico WHERE id = $1', [osId]);
        if (result.rows.length === 0) throw new Error('Ordem de serviço não encontrada');
        return result.rows[0];
      });
      
      ws.etapaConcluido(osId, 'dados_os', tempoOS);
      atualizarProgresso(1);

      const origemLat = parseFloat(os.ponto_origem_latitude);
      const origemLng = parseFloat(os.ponto_origem_longitude);
      const destinoLat = parseFloat(os.ponto_destino_latitude);
      const destinoLng = parseFloat(os.ponto_destino_longitude);

      if (isNaN(origemLat) || isNaN(origemLng) || isNaN(destinoLat) || isNaN(destinoLng)) {
        throw new Error(`Coordenadas inválidas na OS ${osId}: origem(${os.ponto_origem_latitude}, ${os.ponto_origem_longitude}) destino(${os.ponto_destino_latitude}, ${os.ponto_destino_longitude})`);
      }

      const origem: Coordenada = { lat: origemLat, lng: origemLng };
      const destino: Coordenada = { lat: destinoLat, lng: destinoLng };

      ws.log(osId, 'info', 'dados_os', `Origem: ${origem.lat.toFixed(6)}, ${origem.lng.toFixed(6)}`);
      ws.log(osId, 'info', 'dados_os', `Destino: ${destino.lat.toFixed(6)}, ${destino.lng.toFixed(6)}`);

      const margem = 0.005;
      const bbox: BoundingBox = {
        norte: Math.max(origem.lat, destino.lat) + margem,
        sul: Math.min(origem.lat, destino.lat) - margem,
        leste: Math.max(origem.lng, destino.lng) + margem,
        oeste: Math.min(origem.lng, destino.lng) - margem,
      };

      // =====================================================================
      // ETAPA 2: Consultar OSM
      // =====================================================================
      ws.etapaInicio(osId, 'osm', 'Consultando OpenStreetMap');
      ws.consultaAPI(osId, 'Overpass API', 'overpass-api.de', 'executando');
      
      let dadosTerreno: DadosTerreno;
      const { resultado: dadosOSM, tempoMs: tempoOSM } = await medirTempo(async () => {
        return await osmService.buscarDadosTerreno(origem, destino);
      });
      dadosTerreno = dadosOSM;
      
      ws.consultaAPI(osId, 'Overpass API', 'overpass-api.de', 'sucesso', tempoOSM);
      ws.etapaProgresso(osId, 'osm', 50, `${dadosTerreno.ruas.length} ruas encontradas`);
      ws.etapaProgresso(osId, 'osm', 75, `${dadosTerreno.edificacoes.length} edificações`);
      ws.etapaProgresso(osId, 'osm', 100, `${dadosTerreno.obstaculos.length} obstáculos`);
      ws.etapaConcluido(osId, 'osm', tempoOSM);
      atualizarProgresso(2);

      // =====================================================================
      // ETAPA 3: Consultar Google Maps
      // =====================================================================
      let barreirasGoogle: any[] = [];
      const usarGoogleMaps = config?.usar_google_maps !== false;
      
      if (usarGoogleMaps) {
        ws.etapaInicio(osId, 'google', 'Consultando Google Maps');
        
        try {
          ws.consultaAPI(osId, 'Google Places API', 'maps.googleapis.com/places', 'executando');
          ws.consultaAPI(osId, 'Google Elevation API', 'maps.googleapis.com/elevation', 'executando');
          
          const { resultado: resultadoGoogle, tempoMs: tempoGoogle } = await medirTempo(async () => {
            return await googleMapsService.analisarRota(origem, destino);
          });
          
          barreirasGoogle = resultadoGoogle.barreiras;
          
          ws.consultaAPI(osId, 'Google Places API', 'maps.googleapis.com/places', 'sucesso', tempoGoogle);
          ws.consultaAPI(osId, 'Google Elevation API', 'maps.googleapis.com/elevation', 'sucesso', tempoGoogle);
          ws.etapaProgresso(osId, 'google', 100, `${barreirasGoogle.length} barreiras detectadas`);
          ws.etapaConcluido(osId, 'google', tempoGoogle);
        } catch (error: any) {
          ws.etapaErro(osId, 'google', error.message);
        }
      } else {
        ws.log(osId, 'info', 'google', 'Consulta ao Google Maps desabilitada');
      }
      atualizarProgresso(3);

      // =====================================================================
      // ETAPA 4: Consultar IBGE/ANEEL
      // =====================================================================
      let dadosIBGE: any = null;
      let dadosANEEL: any = null;
      const usarIBGE = config?.usar_ibge !== false;
      
      if (usarIBGE) {
        ws.etapaInicio(osId, 'ibge', 'Consultando IBGE e ANEEL');
        
        try {
          ws.consultaAPI(osId, 'Nominatim (Geocoding)', 'nominatim.openstreetmap.org', 'executando');
          ws.consultaAPI(osId, 'IBGE Municípios', 'servicodados.ibge.gov.br', 'executando');
          
          const { resultado: fontes, tempoMs: tempoFontes } = await medirTempo(async () => {
            return await fontesExternasService.consultarTudo(origem, (etapa, detalhe, prog) => {
              ws.etapaProgresso(osId, 'ibge', prog, detalhe);
            });
          });
          
          dadosIBGE = fontes.ibge;
          dadosANEEL = fontes.aneel;
          
          for (const consulta of fontes.consultasRealizadas) {
            ws.consultaAPI(osId, consulta.fonte, consulta.url, consulta.status as any, consulta.tempoMs);
          }
          
          if (dadosIBGE?.municipio) {
            ws.log(osId, 'sucesso', 'ibge', `Município: ${dadosIBGE.municipio.nome}/${dadosIBGE.municipio.uf}`);
          }
          if (dadosANEEL?.distribuidora) {
            ws.log(osId, 'sucesso', 'aneel', `Distribuidora: ${dadosANEEL.distribuidora.nome}`);
          }
          
          ws.etapaConcluido(osId, 'ibge', tempoFontes);
        } catch (error: any) {
          ws.etapaErro(osId, 'ibge', error.message);
        }
      }
      atualizarProgresso(4);

      // =====================================================================
      // ETAPA 5: Cálculo de elevação
      // =====================================================================
      ws.etapaInicio(osId, 'elevacao', 'Calculando perfil altimétrico (SRTM)');
      ws.consultaAPI(osId, 'Open-Elevation API', 'api.open-elevation.com', 'executando');
      
      let perfil: PerfilAltimetrico;
      try {
        const { resultado: perfilCalc, tempoMs: tempoElevacao } = await medirTempo(async () => {
          return await elevacaoService.calcularPerfilAltimetrico([origem, destino]);
        });
        perfil = perfilCalc;
        
        ws.consultaAPI(osId, 'Open-Elevation API', 'api.open-elevation.com', 'sucesso', tempoElevacao);
        ws.log(osId, 'info', 'elevacao', `Elevação: ${perfil.elevacaoMinima.toFixed(0)}m - ${perfil.elevacaoMaxima.toFixed(0)}m`);
        ws.etapaConcluido(osId, 'elevacao', tempoElevacao);
      } catch (error: any) {
        perfil = { pontos: [], elevacaoMinima: 0, elevacaoMaxima: 0, desnivelTotal: 0, decliveMaximo: 0 };
        ws.etapaErro(osId, 'elevacao', error.message);
      }
      atualizarProgresso(5);

      // =====================================================================
      // ETAPA 6: Classificação de área
      // =====================================================================
      ws.etapaInicio(osId, 'classificacao', 'Classificando tipo de área');
      
      let tipoArea: TipoArea;
      let classificacaoArea: ClassificacaoArea | undefined;
      
      if (config?.tipo_area_forcado) {
        tipoArea = config.tipo_area_forcado;
        ws.log(osId, 'info', 'classificacao', `Tipo de área FORÇADO: ${tipoArea}`);
      } else {
        const { resultado: classif, tempoMs: tempoClassif } = await medirTempo(async () => {
          return await areaClassifierService.classificarArea(origem, destino, dadosTerreno, false);
        });
        classificacaoArea = classif;
        tipoArea = classif.tipo;
        
        ws.log(osId, 'sucesso', 'classificacao', `Área: ${tipoArea} (confiança: ${(classif.confianca * 100).toFixed(0)}%)`);
        ws.etapaConcluido(osId, 'classificacao', tempoClassif);
      }
      
      const tipoRede = config?.tipo_rede || 'mt_convencional';
      const regrasVao = areaClassifierService.obterRegrasVao(tipoArea, tipoRede);
      ws.log(osId, 'info', 'classificacao', `Vãos: min=${regrasVao.vaoMinimo}m, ideal=${regrasVao.vaoIdeal}m, max=${regrasVao.vaoMaximo}m`);
      
      const configProjeto = montarConfigProjeto(config, os.estado || 'MA', tipoArea);
      atualizarProgresso(6);

      // =====================================================================
      // ETAPA 7: Roteamento inteligente
      // =====================================================================
      ws.etapaInicio(osId, 'roteamento', 'Calculando rota inteligente');
      
      let rota: Coordenada[];
      let metodo: 'osrm' | 'osm' | 'linha_reta' = 'linha_reta';
      
      // Primeiro, tentar OSRM
      ws.consultaAPI(osId, 'OSRM', 'router.project-osrm.org', 'executando');
      
      try {
        const { resultado: resultadoRota, tempoMs: tempoRota } = await medirTempo(async () => {
          return await roteamentoService.calcularRota(origem, destino);
        });
        
        if (resultadoRota.sucesso && resultadoRota.pontos.length > 2) {
          rota = resultadoRota.pontos;
          metodo = 'osrm';
          ws.consultaAPI(osId, 'OSRM', 'router.project-osrm.org', 'sucesso', tempoRota);
          ws.log(osId, 'sucesso', 'roteamento', `OSRM: ${rota.length} pontos, ${resultadoRota.distanciaTotal.toFixed(0)}m`);
        } else {
          throw new Error('OSRM retornou rota inválida');
        }
      } catch (error: any) {
        ws.consultaAPI(osId, 'OSRM', 'router.project-osrm.org', 'erro');
        ws.log(osId, 'aviso', 'roteamento', `OSRM falhou: ${error.message}, usando linha reta`);
        rota = [origem, destino];
      }
      
      ws.etapaConcluido(osId, 'roteamento', 0);
      atualizarProgresso(7);

      // =====================================================================
      // ETAPA 8: Posicionamento de postes (inteligente)
      // =====================================================================
      ws.etapaInicio(osId, 'postes', 'Posicionando postes');
      ws.etapaProgresso(osId, 'postes', 10, 'Detectando esquinas...');
      
      const temObstaculos = dadosTerreno.obstaculos.length > 0;
      const vaoIdeal = areaClassifierService.calcularVaoIdeal(tipoArea, tipoRede, temObstaculos, perfil.decliveMaximo);
      
      let pontosPostes: PontoPoste[];
      let esquinasUtilizadas = 0;
      let travessiasDetectadas = 0;
      
      const { resultado: resultadoInteligente, tempoMs: tempoPostes } = await medirTempo(async () => {
        return await roteamentoInteligenteService.analisarRota(
          rota,
          dadosTerreno,
          vaoIdeal,
          regrasVao.vaoMaximo,
          regrasVao.vaoMinimo
        );
      });
      
      pontosPostes = resultadoInteligente.pontosPostes;
      esquinasUtilizadas = resultadoInteligente.estatisticas.postesEmEsquinas;
      travessiasDetectadas = resultadoInteligente.estatisticas.totalTravessias;
      
      ws.etapaProgresso(osId, 'postes', 30, `${resultadoInteligente.esquinasDetectadas.length} esquinas detectadas`);
      ws.etapaProgresso(osId, 'postes', 50, `${travessiasDetectadas} travessias detectadas`);
      ws.etapaProgresso(osId, 'postes', 70, `${resultadoInteligente.zonasExclusao.length} edificações evitadas`);
      ws.etapaProgresso(osId, 'postes', 90, `${pontosPostes.length} postes posicionados`);
      
      ws.log(osId, 'sucesso', 'postes', `Postes: ${pontosPostes.length} (${esquinasUtilizadas} em esquinas)`);
      ws.etapaConcluido(osId, 'postes', tempoPostes);
      atualizarProgresso(8);

      // Criar objetos de postes
      const postes: PosteComEquipamentos[] = pontosPostes.map((ponto, index) => {
        let anguloDeflexao = 0;
        if (index > 0 && index < pontosPostes.length - 1) {
          anguloDeflexao = calcularAnguloDeflexao(
            pontosPostes[index - 1].coordenada,
            ponto.coordenada,
            pontosPostes[index + 1].coordenada
          );
        }

        const temTrafo = !!(config?.trafo_kva && config?.trafo_posicao === index);
        const funcao = determinarFuncaoPoste(
          index, pontosPostes.length, anguloDeflexao, temTrafo, false, ponto.tipo
        );
        
        const dimensionamento = regrasEquatorialService.dimensionarPoste(configProjeto, funcao, {
          trafoKVA: temTrafo ? config?.trafo_kva : undefined,
        });

        const isOrigem = index === 0;
        const isDestino = index === pontosPostes.length - 1;

        return {
          id: `P${String(index + 1).padStart(3, '0')}`,
          codigo: `P-${String(index + 1).padStart(3, '0')}`,
          latitude: ponto.coordenada.lat,
          longitude: ponto.coordenada.lng,
          altura: dimensionamento.altura,
          resistencia: dimensionamento.resistencia,
          estrutura: regrasEquatorialService.selecionarEstrutura(configProjeto, funcao, anguloDeflexao),
          tipo: isOrigem ? ('existente' as const) : ('novo' as const),
          funcao,
          trafo_kva: temTrafo ? config?.trafo_kva : undefined,
          chave_fusivel: temTrafo || funcao === 'DERIVACAO',
          para_raios: temTrafo || isDestino,
          estai: funcao === 'FIM' || funcao === 'ANCORAGEM' || anguloDeflexao > 30,
          aterramento: isOrigem || isDestino || temTrafo || funcao === 'FIM',
          justificativa_posicao: ponto.justificativa,
          tipo_posicao: ponto.tipo,
        };
      });

      // =====================================================================
      // ETAPA 9: Validação e detecção de barreiras
      // =====================================================================
      ws.etapaInicio(osId, 'validacao', 'Validando projeto e detectando barreiras');
      
      const postesParaBarreiras: PosteGerado[] = postes.map((p) => ({
        id: p.id, codigo: p.codigo, latitude: p.latitude, longitude: p.longitude,
        altura: p.altura, resistencia: p.resistencia, estrutura: p.estrutura, tipo: p.tipo,
      }));

      ws.etapaProgresso(osId, 'validacao', 30, 'Detectando barreiras OSM...');
      let relatorioBarreiras = barreirasService.detectarBarreiras(postesParaBarreiras, dadosTerreno, perfil);
      
      // Combinar com barreiras do Google
      if (barreirasGoogle.length > 0) {
        ws.etapaProgresso(osId, 'validacao', 50, 'Combinando barreiras Google Maps...');
        const combinadas = googleMapsService.combinarBarreiras(relatorioBarreiras.barreiras, barreirasGoogle);
        relatorioBarreiras = barreirasService.gerarRelatorio(combinadas);
      }
      
      ws.etapaProgresso(osId, 'validacao', 70, `${relatorioBarreiras.resumo.total} barreiras detectadas`);
      
      // Criar condutores
      const condutores: CondutorGerado[] = [];
      let extensaoMT = 0;
      let extensaoBT = 0;

      for (let i = 0; i < postes.length - 1; i++) {
        const pO = postes[i];
        const pD = postes[i + 1];
        const comp = calcularDistancia({ lat: pO.latitude, lng: pO.longitude }, { lat: pD.latitude, lng: pD.longitude });

        condutores.push({
          id: `CMT-${String(i + 1).padStart(3, '0')}`,
          poste_origem_id: pO.id,
          poste_destino_id: pD.id,
          tipo_rede: 'MT',
          tipo_cabo: configProjeto.condutorMT,
          comprimento_metros: comp,
        });
        extensaoMT += comp;

        if (configProjeto.comBT) {
          condutores.push({
            id: `CBT-${String(i + 1).padStart(3, '0')}`,
            poste_origem_id: pO.id,
            poste_destino_id: pD.id,
            tipo_rede: 'BT',
            tipo_cabo: configProjeto.condutorBT,
            comprimento_metros: comp,
          });
          extensaoBT += comp;
        }
      }

      ws.etapaProgresso(osId, 'validacao', 85, 'Validando regras Equatorial...');
      
      // Validar
      const condVal = condutores.map((c) => ({
        id: c.id, comprimento: c.comprimento_metros,
        poste_origem_id: c.poste_origem_id, poste_destino_id: c.poste_destino_id,
      }));
      const validacao = regrasEquatorialService.validarProjeto(postesParaBarreiras, condVal, configProjeto);
      
      // Converter para formato de erros/avisos detalhados
      // ValidacaoItem tem: campo, valor, esperado, valido, mensagem, severidade
      // Extrair posteId do campo (ex: "poste.P001.altura" -> "P001")
      const extrairPosteId = (campo: string): string | undefined => {
        const match = campo.match(/^poste\.(P\d+)\./);
        return match ? match[1] : undefined;
      };

      const extrairCategoria = (campo: string): string => {
        if (campo.startsWith('poste.')) return 'POSTE';
        if (campo.startsWith('condutor.')) return 'CONDUTOR';
        if (campo.startsWith('aterramento')) return 'ATERRAMENTO';
        return 'VALIDAÇÃO';
      };

      const errosDetalhados: ErroValidacao[] = validacao.erros.map((e, i) => {
        const posteId = extrairPosteId(e.campo);
        return {
          id: `ERR_${i + 1}`,
          tipo: 'ERRO',
          categoria: extrairCategoria(e.campo),
          mensagem: e.mensagem,
          detalhe: `Campo: ${e.campo} | Valor: ${e.valor} | Esperado: ${e.esperado}`,
          localizacao: posteId ? {
            lat: postes.find(p => p.id === posteId)?.latitude || 0,
            lng: postes.find(p => p.id === posteId)?.longitude || 0,
            posteId,
          } : undefined,
          sugestao: `Ajustar ${e.campo} para ${e.esperado}`,
          regra: e.campo,
        };
      });

      const avisosDetalhados: AvisoValidacao[] = validacao.avisos.map((a, i) => {
        const posteId = extrairPosteId(a.campo);
        return {
          id: `AVS_${i + 1}`,
          tipo: 'AVISO',
          categoria: extrairCategoria(a.campo),
          mensagem: a.mensagem,
          detalhe: `Campo: ${a.campo} | Valor: ${a.valor} | Esperado: ${a.esperado}`,
          localizacao: posteId ? {
            lat: postes.find(p => p.id === posteId)?.latitude || 0,
            lng: postes.find(p => p.id === posteId)?.longitude || 0,
            posteId,
          } : undefined,
          sugestao: `Ajustar ${a.campo} para ${a.esperado}`,
        };
      });
      
      ws.log(osId, validacao.erros.length > 0 ? 'erro' : 'sucesso', 'validacao', 
        `Validação: ${validacao.erros.length} erros, ${validacao.avisos.length} avisos`);
      ws.etapaConcluido(osId, 'validacao', 0);
      atualizarProgresso(9);

      // =====================================================================
      // ETAPA 10: Geração de saídas
      // =====================================================================
      ws.etapaInicio(osId, 'saidas', 'Gerando arquivos de saída');
      
      ws.etapaProgresso(osId, 'saidas', 30, 'Gerando lista de materiais...');
      const materiais = materiaisService.gerarListaMateriais(postes, condutores, relatorioBarreiras, configProjeto);
      
      ws.etapaProgresso(osId, 'saidas', 70, 'Gerando arquivo DXF...');
      const dxf = dxfService.gerarDXF(postes, condutores, relatorioBarreiras, configProjeto);
      
      ws.log(osId, 'info', 'saidas', `Materiais: ${materiais.resumo.total_itens} itens`);
      ws.log(osId, 'info', 'saidas', `DXF: ${Math.round(dxf.length / 1024)}KB`);
      ws.etapaConcluido(osId, 'saidas', 0);
      atualizarProgresso(10);

      // =====================================================================
      // Resultado final
      // =====================================================================
      const condutoresMT = condutores.filter(c => c.tipo_rede === 'MT');
      const vaoMedio = condutoresMT.length > 0 && postes.length > 1
        ? condutoresMT.reduce((s, c) => s + c.comprimento_metros, 0) / (postes.length - 1)
        : 0;

      const resultado: ResultadoGeracao = {
        sucesso: validacao.erros.length === 0,
        postes,
        condutores,
        barreiras: relatorioBarreiras,
        materiais,
        dxf,
        perfil,
        resumo: {
          total_postes: postes.length,
          total_condutores: condutores.length,
          extensao_mt: Math.round(extensaoMT),
          extensao_bt: Math.round(extensaoBT),
          erros: validacao.erros.length,
          avisos: validacao.avisos.length,
          metodo,
          tipo_area: tipoArea,
          vao_utilizado: Math.round(vaoIdeal),
          esquinas_utilizadas: esquinasUtilizadas,
          travessias_detectadas: travessiasDetectadas,
        },
        validacao_detalhes: {
          erros: errosDetalhados,
          avisos: avisosDetalhados,
        },
        classificacao_area: classificacaoArea,
        dados_ibge: dadosIBGE,
        dados_aneel: dadosANEEL,
      };

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[RESUMO] ${tipoArea} | ${postes.length} postes | vão ${vaoMedio.toFixed(0)}m | ${metodo}`);
      console.log(`[RESUMO] Esquinas: ${esquinasUtilizadas} | Travessias: ${travessiasDetectadas}`);
      console.log(`${'='.repeat(60)}\n`);

      ws.concluido(osId, resultado);
      return resultado;

    } catch (error: any) {
      console.error(`[GERAÇÃO] Erro: ${error.message}`);
      ws.erro(osId, error.message);
      throw error;
    }
  },

  /**
   * Salva projeto no banco de dados
   */
  async salvarProjeto(osId: number, postes: PosteComEquipamentos[], condutores: CondutorGerado[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM condutor WHERE ordem_servico_id = $1', [osId]);
      await client.query('DELETE FROM poste WHERE ordem_servico_id = $1', [osId]);

      const posteIdMap: Record<string, number> = {};
      for (let i = 0; i < postes.length; i++) {
        const p = postes[i];
        const r = await client.query(
          `INSERT INTO poste (ordem_servico_id, codigo, latitude, longitude, tipo, altura_metros, estrutura, sequencia)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [osId, p.codigo, p.latitude, p.longitude, p.tipo, p.altura, p.estrutura, i + 1]
        );
        posteIdMap[p.id] = r.rows[0].id;
      }

      for (const c of condutores) {
        const tipoRede = c.tipo_rede === 'MT' ? 'primaria' : 'secundaria';
        await client.query(
          `INSERT INTO condutor (ordem_servico_id, poste_origem_id, poste_destino_id, codigo, tipo_rede, tipo_cabo, comprimento_metros)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [osId, posteIdMap[c.poste_origem_id], posteIdMap[c.poste_destino_id], c.id, tipoRede, c.tipo_cabo, c.comprimento_metros]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  gerarDXF(postes: PosteComEquipamentos[], condutores: CondutorGerado[], barreiras: RelatorioBarreiras, config: ConfigGeracao): string {
    const configProjeto = montarConfigProjeto(config, 'MA', 'URBANA');
    return dxfService.gerarDXF(postes, condutores, barreiras, configProjeto);
  },

  gerarMateriais(postes: PosteComEquipamentos[], condutores: CondutorGerado[], barreiras: RelatorioBarreiras, config: ConfigGeracao): ListaMateriais {
    const configProjeto = montarConfigProjeto(config, 'MA', 'URBANA');
    return materiaisService.gerarListaMateriais(postes, condutores, barreiras, configProjeto);
  },
};

export default geracaoService;
