// =============================================================================
// Rotas: Ordem de Serviço
// =============================================================================

import { Router, Request, Response } from 'express';
import pool from '../db';
import { geracaoService } from '../services/geracaoService';

const router = Router();

/**
 * POST /api/os/:id/gerar-projeto
 * Gera projeto para uma OS
 */
router.post('/:id/gerar-projeto', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.id, 10);
  const config = req.body;

  if (isNaN(osId) || osId <= 0) {
    return res.status(400).json({ error: 'ID de OS inválido' });
  }

  try {
    const resultado = await geracaoService.gerarProjeto(osId, config);

    if (resultado.sucesso) {
      await geracaoService.salvarProjeto(osId, resultado.postes, resultado.condutores);
    }

    // =========================================================================
    // Transformar resposta para formato esperado pelo frontend
    // =========================================================================

    // 1. Barreiras: converter coordenada:{lat,lng} → latitude/longitude separados
    //    e mapear tipos internos para tipos do frontend
    const MAPA_TIPO_BARREIRA_FRONTEND: Record<string, string> = {
      'TRAVESSIA_HIDRICA': 'TRAVESSIA_HIDRICA',
      'TRAVESSIA_FERROVIARIA': 'TRAVESSIA_FERROVIARIA',
      'TRAVESSIA_RODOVIARIA': 'TRAVESSIA_RODOVIARIA',
      'TRAVESSIA_LT': 'LT_CRUZAMENTO',
      'PODA_FAIXA': 'VEGETACAO',
      'PODA_ARVORE': 'VEGETACAO',
      'DECLIVE_ACENTUADO': 'AREA_ALAGAVEL', // mais próximo visualmente
    };

    const barreirasFormatadas = resultado.barreiras.barreiras.map((b: any, idx: number) => ({
      id: b.id || `BAR_${idx + 1}`,
      tipo: MAPA_TIPO_BARREIRA_FRONTEND[b.tipo] || 'VEGETACAO',
      latitude: b.coordenada?.lat ?? 0,
      longitude: b.coordenada?.lng ?? 0,
      descricao: b.descricao || b.nome || 'Barreira detectada',
      severidade: b.severidade === 'CRITICO' ? 'CRITICA' : b.severidade,
    }));

    // 2. validacao_detalhes: converter objetos → strings
    const validacaoFormatada = resultado.validacao_detalhes
      ? {
          erros: resultado.validacao_detalhes.erros.map((e: any) =>
            typeof e === 'string' ? e : e.mensagem || `${e.categoria}: ${e.detalhe}`
          ),
          avisos: resultado.validacao_detalhes.avisos.map((a: any) =>
            typeof a === 'string' ? a : a.mensagem || `${a.categoria}: ${a.detalhe}`
          ),
        }
      : { erros: [], avisos: [] };

    // 3. resumo.metodo: mapear 'osrm' → 'osm' (frontend só aceita 'osm' | 'linha_reta')
    const metodoFrontend = resultado.resumo.metodo === 'osrm' ? 'osm' : resultado.resumo.metodo;

    // Montar resposta no formato do frontend
    const respostaFrontend = {
      sucesso: resultado.sucesso,
      postes: resultado.postes,
      condutores: resultado.condutores,
      barreiras: {
        barreiras: barreirasFormatadas,
        resumo: {
          total: resultado.barreiras.resumo.total,
          criticas: resultado.barreiras.resumo.criticas,
          avisos: resultado.barreiras.resumo.avisos,
        },
      },
      materiais: resultado.materiais,
      perfil: resultado.perfil,
      resumo: {
        ...resultado.resumo,
        metodo: metodoFrontend,
      },
      validacao_detalhes: validacaoFormatada,
    };

    res.json(respostaFrontend);
  } catch (error: any) {
    console.error(`[GERACAO] Erro:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/os
 * Lista todas as ordens de serviço
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        numero_os,
        tipo_projeto,
        tipo_rede,
        status,
        municipio,
        estado,
        ponto_origem_latitude,
        ponto_origem_longitude,
        ponto_destino_latitude,
        ponto_destino_longitude,
        created_at,
        updated_at
      FROM ordem_servico 
      ORDER BY created_at DESC
    `);
    
    res.json(result.rows);
  } catch (error: any) {
    console.error('[OS] Erro ao listar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/os/:id
 * Retorna uma ordem de serviço específica
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM ordem_servico WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[OS] Erro ao buscar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/os
 * Cria uma nova ordem de serviço
 */
router.post('/', async (req: Request, res: Response) => {
  const {
    numero_os,
    tipo_projeto,
    tipo_rede,
    municipio,
    estado,
    ponto_origem_latitude,
    ponto_origem_longitude,
    ponto_destino_latitude,
    ponto_destino_longitude,
    descricao,
  } = req.body;

  // Validações
  if (!numero_os || typeof numero_os !== 'string' || numero_os.trim().length === 0) {
    return res.status(400).json({ error: 'Número da OS é obrigatório' });
  }
  if (!ponto_origem_latitude || !ponto_origem_longitude) {
    return res.status(400).json({ error: 'Ponto de origem é obrigatório' });
  }
  if (!ponto_destino_latitude || !ponto_destino_longitude) {
    return res.status(400).json({ error: 'Ponto de destino é obrigatório' });
  }
  // Validar que coordenadas são numéricas e dentro de faixas válidas
  const oLat = parseFloat(ponto_origem_latitude);
  const oLng = parseFloat(ponto_origem_longitude);
  const dLat = parseFloat(ponto_destino_latitude);
  const dLng = parseFloat(ponto_destino_longitude);
  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
    return res.status(400).json({ error: 'Coordenadas devem ser valores numéricos válidos' });
  }
  if (oLat < -90 || oLat > 90 || dLat < -90 || dLat > 90) {
    return res.status(400).json({ error: 'Latitude deve estar entre -90 e 90' });
  }
  if (oLng < -180 || oLng > 180 || dLng < -180 || dLng > 180) {
    return res.status(400).json({ error: 'Longitude deve estar entre -180 e 180' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ordem_servico (
        numero_os, tipo_projeto, tipo_rede, status, municipio, estado,
        ponto_origem_latitude, ponto_origem_longitude,
        ponto_destino_latitude, ponto_destino_longitude,
        descricao
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        numero_os,
        tipo_projeto || 'EXTENSAO',
        tipo_rede || 'mt_convencional',
        'PENDENTE',
        municipio || '',
        estado || 'MA',
        ponto_origem_latitude,
        ponto_origem_longitude,
        ponto_destino_latitude,
        ponto_destino_longitude,
        descricao || '',
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    console.error('[OS] Erro ao criar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/os/:id
 * Atualiza uma ordem de serviço
 */
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const {
    numero_os,
    tipo_projeto,
    tipo_rede,
    status,
    municipio,
    estado,
    ponto_origem_latitude,
    ponto_origem_longitude,
    ponto_destino_latitude,
    ponto_destino_longitude,
    descricao,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ordem_servico SET
        numero_os = COALESCE($1, numero_os),
        tipo_projeto = COALESCE($2, tipo_projeto),
        tipo_rede = COALESCE($3, tipo_rede),
        status = COALESCE($4, status),
        municipio = COALESCE($5, municipio),
        estado = COALESCE($6, estado),
        ponto_origem_latitude = COALESCE($7, ponto_origem_latitude),
        ponto_origem_longitude = COALESCE($8, ponto_origem_longitude),
        ponto_destino_latitude = COALESCE($9, ponto_destino_latitude),
        ponto_destino_longitude = COALESCE($10, ponto_destino_longitude),
        descricao = COALESCE($11, descricao),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
      [
        numero_os,
        tipo_projeto,
        tipo_rede,
        status,
        municipio,
        estado,
        ponto_origem_latitude,
        ponto_origem_longitude,
        ponto_destino_latitude,
        ponto_destino_longitude,
        descricao,
        id,
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[OS] Erro ao atualizar:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/os/:id
 * Remove uma ordem de serviço
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Primeiro remover dependências
    await client.query('DELETE FROM condutor WHERE ordem_servico_id = $1', [id]);
    await client.query('DELETE FROM poste WHERE ordem_servico_id = $1', [id]);

    // Depois remover a OS
    const result = await client.query(
      'DELETE FROM ordem_servico WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Ordem de serviço removida', id });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[OS] Erro ao remover:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/os/:id/postes
 * Lista postes de uma OS
 */
router.get('/:id/postes', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  try {
    const result = await pool.query(
      'SELECT * FROM poste WHERE ordem_servico_id = $1 ORDER BY sequencia',
      [id]
    );
    
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/os/:id/condutores
 * Lista condutores de uma OS
 */
router.get('/:id/condutores', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  
  try {
    const result = await pool.query(
      'SELECT * FROM condutor WHERE ordem_servico_id = $1',
      [id]
    );
    
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
