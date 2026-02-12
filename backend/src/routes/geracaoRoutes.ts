// =============================================================================
// Rotas: Geração de Projeto
// =============================================================================

import { Router, Request, Response } from 'express';
import { geracaoService, ConfigGeracao } from '../services/geracaoService';
import pool from '../db';

const router = Router();

// Lock para evitar geração concorrente na mesma OS
const geracaoEmAndamento = new Set<number>();

/**
 * POST /api/geracao/:osId/gerar-projeto
 * Rota de compatibilidade com frontend antigo
 */
router.post('/:osId/gerar-projeto', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);
  const config = req.body;

  if (isNaN(osId) || osId <= 0) {
    return res.status(400).json({ error: 'ID de OS inválido' });
  }

  if (geracaoEmAndamento.has(osId)) {
    return res.status(409).json({ error: 'Geração já em andamento para esta OS' });
  }

  geracaoEmAndamento.add(osId);
  try {
    const resultado = await geracaoService.gerarProjeto(osId, config);

    if (resultado.sucesso) {
      await geracaoService.salvarProjeto(osId, resultado.postes, resultado.condutores);
    }

    res.json(resultado);
  } catch (error: any) {
    console.error(`[GERACAO] Erro:`, error.message);
    if (error.message === 'Ordem de serviço não encontrada') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  } finally {
    geracaoEmAndamento.delete(osId);
  }
});

/**
 * POST /api/geracao/:osId/iniciar
 * Inicia a geração de projeto para uma OS
 * O progresso é enviado via WebSocket
 */
router.post('/:osId/iniciar', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);
  const config: ConfigGeracao = req.body;

  if (isNaN(osId) || osId <= 0) {
    return res.status(400).json({ error: 'ID de OS inválido' });
  }

  if (geracaoEmAndamento.has(osId)) {
    return res.status(409).json({ error: 'Geração já em andamento para esta OS' });
  }

  geracaoEmAndamento.add(osId);
  try {
    // Iniciar geração em background
    // O cliente receberá atualizações via WebSocket
    const resultadoPromise = geracaoService.gerarProjeto(osId, config);

    // Responder imediatamente que a geração foi iniciada
    res.json({
      status: 'iniciado',
      osId,
      mensagem: 'Geração iniciada. Acompanhe o progresso via WebSocket.',
      websocket: `ws://localhost:3001/ws?osId=${osId}`
    });

    // Aguardar conclusão e salvar
    const resultado = await resultadoPromise;

    if (resultado.sucesso) {
      await geracaoService.salvarProjeto(osId, resultado.postes, resultado.condutores);
    }

  } catch (error: any) {
    console.error(`[GERACAO] Erro na OS ${osId}:`, error.message);
    // O erro já foi enviado via WebSocket
  } finally {
    geracaoEmAndamento.delete(osId);
  }
});

/**
 * POST /api/geracao/:osId/gerar
 * Gera projeto de forma síncrona (aguarda conclusão)
 */
router.post('/:osId/gerar', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);
  const config: ConfigGeracao = req.body;

  if (isNaN(osId) || osId <= 0) {
    return res.status(400).json({ error: 'ID de OS inválido' });
  }

  try {
    const resultado = await geracaoService.gerarProjeto(osId, config);
    
    if (resultado.sucesso) {
      await geracaoService.salvarProjeto(osId, resultado.postes, resultado.condutores);
    }

    res.json(resultado);

  } catch (error: any) {
    console.error(`[GERACAO] Erro:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geracao/:osId/resultado
 * Retorna o resultado da última geração (se existir)
 */
router.get('/:osId/resultado', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);

  if (isNaN(osId) || osId <= 0) {
    return res.status(400).json({ error: 'ID de OS inválido' });
  }

  try {
    // Buscar postes e condutores do banco
    const postesResult = await pool.query(
      'SELECT * FROM poste WHERE ordem_servico_id = $1 ORDER BY sequencia',
      [osId]
    );
    
    const condutoresResult = await pool.query(
      'SELECT * FROM condutor WHERE ordem_servico_id = $1',
      [osId]
    );

    if (postesResult.rows.length === 0) {
      return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.json({
      osId,
      postes: postesResult.rows,
      condutores: condutoresResult.rows,
      total_postes: postesResult.rows.length,
      total_condutores: condutoresResult.rows.length,
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/geracao/:osId/dxf
 * Retorna o arquivo DXF do projeto
 */
router.get('/:osId/dxf', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);

  // Por enquanto retorna erro - seria necessário armazenar o DXF
  res.status(501).json({ error: 'Endpoint não implementado. Use /gerar para obter o DXF.' });
});

/**
 * GET /api/geracao/:osId/materiais
 * Retorna a lista de materiais do projeto
 */
router.get('/:osId/materiais', async (req: Request, res: Response) => {
  const osId = parseInt(req.params.osId, 10);

  // Por enquanto retorna erro - seria necessário armazenar os materiais
  res.status(501).json({ error: 'Endpoint não implementado. Use /gerar para obter materiais.' });
});

export default router;
