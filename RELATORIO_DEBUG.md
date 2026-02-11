# RELATÓRIO DE DEBUG GERAL — Sistema de Projetos de Redes Elétricas

**Data:** 2026-02-11
**Escopo:** Debug completo do sistema (backend + frontend)
**Total de correções:** 27 bugs em 4 fases (P0 Crítico → P1 Alto → P2 Segurança → P3 Melhoria)
**Arquivos modificados:** 17 | **Arquivos criados:** 1 | **Arquivos removidos:** 0
**Resultado:** Backend 18→0 erros TypeScript | Frontend manteve 0 erros

---

## 1. ARQUIVOS MODIFICADOS

### Backend (10 arquivos)

| Arquivo | Resumo da Mudança |
|---------|-------------------|
| `backend/src/index.ts` | CORS restrito a origens configuráveis (`CORS_ORIGINS` env), sanitização de erros em produção, graceful shutdown (SIGTERM/SIGINT → fecha HTTP + pool DB) |
| `backend/src/routes/osRoutes.ts` | Transação no DELETE (BEGIN/COMMIT/ROLLBACK para cascata condutor→poste→OS), validação de coordenadas no POST (faixas lat/lng, tipo numérico, campos obrigatórios) |
| `backend/src/routes/geracaoRoutes.ts` | Lock de concorrência (`Set<number>`) para evitar geração duplicada na mesma OS (409 Conflict), substituição de `require()` dinâmico por `import pool` |
| `backend/src/services/geracaoService.ts` | Correção do mapeamento de `ValidacaoItem` (campos `.campo/.valor/.esperado` em vez de `.tipo/.detalhe/.posteId/.sugestao/.regra`), divisão por zero no cálculo de vão médio, guard NaN para parseFloat de coordenadas do banco |
| `backend/src/services/osmService.ts` | Guard null para `data.elements` da Overpass API (2 locais), propriedade `boundingBox` no retorno antecipado quando não há dados |
| `backend/src/services/roteamentoService.ts` | Type assertion correta para `OSRMResponse` (`as OSRMResponse` em vez de cast genérico) |
| `backend/src/services/roteamentoInteligenteService.ts` | Divisão por zero quando `distDir = 0` (pontos coincidentes, 2 locais com guard `< 1e-10`), correção do ID de esquinas (`esquinasMap.size` em vez de `esquinas.length` que era sempre 0) |
| `backend/src/services/barreirasService.ts` | Remoção de filtros inválidos no union type `ObstaculoOSM.tipo` (`'floresta'` e `'parque'` não existem → corrigido para `'area_verde'`) |
| `backend/src/services/googleMapsService.ts` | Remoção de API key hardcoded, leitura via `process.env.GOOGLE_MAPS_API_KEY`, guard para key vazia (retorna dados zerados em vez de chamada que falharia) |
| `backend/src/services/wsManager.ts` | Heartbeat ping/pong a cada 30s para detectar e terminar conexões mortas, limpeza do interval no encerramento |

### Frontend (7 arquivos)

| Arquivo | Resumo da Mudança |
|---------|-------------------|
| `frontend/src/App.tsx` | Adicionado `<ErrorBoundary>` envolvendo `<Routes>` para captura de erros React não tratados |
| `frontend/src/pages/OSFormPageV2.tsx` | Correção do shape da resposta API — backend retorna dados flat, não `{ data: {...} }` |
| `frontend/src/pages/VisualizarProjetoPage.tsx` | Mesma correção de shape API (`data?.data \|\| data`), URL do DXF corrigida de `/os/:id/dxf` para `/geracao/:id/dxf` |
| `frontend/src/pages/GerarProjetoPage.tsx` | `localizarNoMapa` corrigido de no-op para abrir página de visualização em nova aba |
| `frontend/src/components/MonitorGeracao.tsx` | URL WebSocket corrigida para `ws://${window.location.hostname}:3001/ws`, URL API para `process.env.REACT_APP_API_URL`, `simularProgresso` agora chama `onComplete?.()`, clone profundo de `ETAPAS_INICIAL` para evitar mutação de estado |
| `frontend/src/components/ListaErros.tsx` | Correção de memory leak: `URL.revokeObjectURL(url)` após download de CSV/TXT |
| `frontend/src/components/ControleCamadas.tsx` | Remoção de interface `CamadasVisiveis` duplicada, agora importa de `MapaProjeto` |

### Marcados como Deprecated (sem remoção)

| Arquivo | Motivo |
|---------|--------|
| `frontend/src/hooks/useWebSocket.ts` | Não utilizado — `MonitorGeracao.tsx` implementa WebSocket inline. Adicionado `@deprecated` no cabeçalho |
| `frontend/src/services/api.ts` | Não importado por nenhum componente — todos usam `fetch()` direto. Adicionado `@deprecated`, corrigida URL hardcoded |

---

## 2. ARQUIVOS CRIADOS

| Arquivo | Propósito |
|---------|-----------|
| `frontend/src/components/ErrorBoundary.tsx` | React Error Boundary (class component) — captura erros em runtime, exibe UI de fallback com botão "Tentar novamente" e detalhes colapsáveis do stack trace |

---

## 3. ARQUIVOS REMOVIDOS

Nenhum arquivo foi removido.

---

## 4. MUDANÇAS DE LÓGICA

### 4.1 Regras de Negócio que NÃO Mudaram

As seguintes regras documentadas em `CONTEXTO_PROJETO.md` permanecem intactas:

- **Vãos máximos/mínimos** (seção 5.1/5.2) — sem alteração
- **Alturas mínimas de postes** (seção 5.3) — sem alteração
- **Resistência de postes** (seção 5.4) — sem alteração
- **Famílias de estruturas** (U/N/T/CE/SI) (seção 5.5) — sem alteração
- **Condutores padrão** (seção 5.6) — sem alteração
- **Aterramento** (seção 5.9) — sem alteração
- **Proteção** (seção 5.10) — sem alteração
- **Corrosividade** (seção 5.11) — sem alteração
- **Altura mínima ao solo** (seção 5.12) — sem alteração
- **Faixa de servidão** (seção 5.13) — sem alteração
- **Pipeline de 7 etapas** (seção 4) — expandida para 10 etapas no código, mas a lógica base permanece

### 4.2 Mudanças que Afetam o Comportamento

| # | Mudança | Antes | Depois | Impacto |
|---|---------|-------|--------|---------|
| 1 | **Validação de projeto** (geracaoService) | Mapeamento de `ValidacaoItem` acessava campos inexistentes (`.tipo`, `.detalhe`, `.posteId`, `.sugestao`, `.regra`), causando itens de validação com valores `undefined` | Extrai dados corretamente de `.campo`, `.valor`, `.esperado`, `.valido`, `.mensagem`, `.severidade` usando helpers `extrairPosteId()` e `extrairCategoria()` | Validações do motor de regras Equatorial agora aparecem corretamente na UI |
| 2 | **Cálculo de vão médio** (geracaoService) | Dividia por `postes.length - 1` sem verificar se > 0, crash quando há 0 ou 1 poste | Guard: retorna 0 se `condutoresMT.length === 0 \|\| postes.length <= 1` | Evita crash em projetos com dados insuficientes |
| 3 | **Roteamento inteligente** (roteamentoInteligenteService) | Dividia por `distDir` (distância direcional) que podia ser 0 para pontos coincidentes | Guard: `if (distDir < 1e-10) continue;` pula pontos sobrepostos | Evita NaN/Infinity em cálculos de direção |
| 4 | **ID de esquinas** (roteamentoInteligenteService) | Usava `esquinas.length` para ID incremental, mas `esquinas` era array local sempre vazio | Usa `esquinasMap.size` (mapa que acumula esquinas) | Esquinas agora recebem IDs únicos sequenciais corretos |
| 5 | **Filtro de obstáculos** (barreirasService) | Filtrava por tipos `'floresta'` e `'parque'` que não existem no union type `ObstaculoOSM` | Filtro corrigido para `'area_verde'` (tipo existente) | Áreas verdes agora são contabilizadas na análise de barreiras |
| 6 | **Dados OSM vazios** (osmService) | Se Overpass API retornasse resposta sem `elements`, crash com `Cannot read property of undefined` | Guard retorna `{ ruas: [], edificacoes: [], obstaculos: [], boundingBox }` | Graceful degradation quando Overpass falha |
| 7 | **Google Maps sem API key** (googleMapsService) | API key estava hardcoded no código-fonte | Lê de `process.env.GOOGLE_MAPS_API_KEY`, retorna dados zerados se vazia | Segurança (key não exposta no repositório), funciona sem Google Maps |
| 8 | **Geração concorrente** (geracaoRoutes) | Duas requisições simultâneas para mesma OS podiam gerar projetos duplicados | Lock via `Set<number>`, retorna 409 Conflict se já em andamento | Integridade dos dados de projeto |
| 9 | **WebSocket heartbeat** (wsManager) | Conexões mortas/zumbis permaneciam registradas indefinidamente | Ping/pong a cada 30s, `terminate()` se não responder | Limpa memória e evita envio para clientes desconectados |
| 10 | **CORS** (index.ts) | `cors()` sem restrição — qualquer origem aceita | Origens restritas via `CORS_ORIGINS` env (default: `localhost:3000,5173`) | Segurança contra requisições cross-origin não autorizadas |
| 11 | **Erros em produção** (index.ts) | Stack trace completo enviado ao cliente | Em produção (`NODE_ENV=production`): mensagem genérica | Segurança — não vaza paths/detalhes internos |

### 4.3 Mudanças na Comunicação Frontend ↔ Backend

| Ponto | Antes | Depois |
|-------|-------|--------|
| Response shape | Frontend esperava `response.data.data`, backend retornava flat | Frontend usa `data?.data \|\| data` (compatível com ambos) |
| WebSocket URL | Hardcoded `ws://localhost:3001` | Dinâmico: `ws://${window.location.hostname}:3001/ws` |
| API URL no frontend | Hardcoded `http://localhost:3001/api` em vários locais | `process.env.REACT_APP_API_URL \|\| 'http://localhost:3001/api'` |
| DXF download | `/api/os/:id/dxf` (não existe) | `/api/geracao/:id/dxf` (endpoint correto) |

---

## 5. DEPENDÊNCIAS

### Pacotes adicionados ou removidos

**Nenhuma dependência foi adicionada ou removida.** Todas as correções utilizam APIs já disponíveis nos pacotes existentes (`ws`, `express`, `pg`, `react`).

### Dependências documentadas em CONTEXTO_PROJETO.md vs. estado atual

O `CONTEXTO_PROJETO.md` lista:
```
dependencies: axios, cors, express, pg
devDependencies: @types/cors, @types/express, @types/node, @types/pg, ts-node-dev, typescript
```

O projeto atual também utiliza `ws` (WebSocket) no backend e `react`, `react-dom`, `react-router-dom`, `leaflet` no frontend, que **não estão documentados** no CONTEXTO_PROJETO.md (esse documento cobre apenas o backend original).

---

## 6. ESTRUTURA DE PASTAS

### Comparação com CONTEXTO_PROJETO.md

O documento descreve a seguinte estrutura de backend:

```
backend/src/
├── index.ts
├── db.ts
├── utils/geo.ts
├── routes/geracaoRoutes.ts          ← No doc: rota única
├── services/ (9 services)
└── types/index.ts
```

**Diferenças encontradas no estado atual:**

| Item | CONTEXTO_PROJETO.md | Estado Atual |
|------|---------------------|--------------|
| `routes/` | Apenas `geracaoRoutes.ts` | Também existe `osRoutes.ts` (CRUD de OS) |
| `services/` | 9 services listados | 14 services (adicionados: `wsManager.ts`, `googleMapsService.ts`, `roteamentoInteligenteService.ts`, `ibgeService.ts`, `posicionamentoService.ts`) |
| Pipeline | 7 etapas | 10 etapas (adicionadas: Google Maps, IBGE/ANEEL, Classificação de Área) |
| `index.ts` | Servidor Express + rotas CRUD de OS | Apenas servidor Express (CRUD movido para `osRoutes.ts`) |
| WebSocket | Não mencionado | Implementado via `wsManager.ts` com heartbeat |

### Frontend (não documentado em CONTEXTO_PROJETO.md)

O `CONTEXTO_PROJETO.md` menciona que o frontend era "módulo 10 — a implementar". O estado atual possui:

```
frontend/src/
├── App.tsx                           ← Modificado (ErrorBoundary)
├── pages/
│   ├── HomePage.tsx
│   ├── OSListPage.tsx
│   ├── OSFormPageV2.tsx              ← Modificado (API shape)
│   ├── GerarProjetoPage.tsx          ← Modificado (localizarNoMapa)
│   └── VisualizarProjetoPage.tsx     ← Modificado (API shape, DXF URL)
├── components/
│   ├── ErrorBoundary.tsx             ← CRIADO
│   ├── MonitorGeracao.tsx            ← Modificado (WS URL, API URL, progresso)
│   ├── ListaErros.tsx                ← Modificado (memory leak)
│   ├── ControleCamadas.tsx           ← Modificado (tipo duplicado)
│   └── MapaProjeto.tsx
├── hooks/
│   └── useWebSocket.ts              ← Marcado @deprecated
└── services/
    └── api.ts                        ← Marcado @deprecated
```

---

## 7. RESUMO POR FASE

### P0 — Críticos (app não funciona)
| # | Bug | Arquivo |
|---|-----|---------|
| P0.1 | Response shape mismatch frontend/backend | OSFormPageV2, VisualizarProjetoPage |
| P0.2 | URLs de API incorretas no frontend | MonitorGeracao, VisualizarProjetoPage |
| P0.3 | ValidacaoItem com campos inexistentes | geracaoService |
| P0.4 | WebSocket URL inconsistente | MonitorGeracao |

### P1 — Alto (crashes em runtime)
| # | Bug | Arquivo |
|---|-----|---------|
| P1.1 | Divisão por zero (vão médio, direção) | geracaoService, roteamentoInteligenteService |
| P1.2 | Lock de geração concorrente | geracaoRoutes |
| P1.3 | Transação no DELETE OS | osRoutes |
| P1.4 | Null check Overpass elements | osmService |
| P1.5 | simularProgresso sem onComplete | MonitorGeracao |
| P1.6 | Tipos inválidos no filtro de obstáculos | barreirasService |
| P1.7 | OSRMResponse type assertion | roteamentoService |

### P2 — Segurança e Estabilidade
| # | Correção | Arquivo |
|---|----------|---------|
| P2.1 | API key hardcoded removida | googleMapsService |
| P2.2 | Validação de entrada POST OS | osRoutes |
| P2.3 | CORS restrito | index.ts |
| P2.4 | NaN guard parseFloat | geracaoService |
| P2.5 | React Error Boundary | ErrorBoundary (novo), App.tsx |
| P2.6 | WebSocket heartbeat | wsManager |
| P2.7 | Memory leak blob URLs | ListaErros |
| P2.8 | Graceful shutdown | index.ts |

### P3 — Melhorias de Código
| # | Melhoria | Arquivo |
|---|----------|---------|
| P3.1 | @deprecated useWebSocket | useWebSocket |
| P3.2 | @deprecated services/api | api.ts |
| P3.3 | localizarNoMapa funcional | GerarProjetoPage |
| P3.4 | require() → import | geracaoRoutes |
| P3.5 | Esquina ID counter | roteamentoInteligenteService |
| P3.6 | Erro sanitizado em produção | index.ts |
| P3.7 | Tipo CamadasVisiveis duplicado | ControleCamadas |
| P3.8 | ETAPAS_INICIAL clone profundo | MonitorGeracao |

---

## 8. VARIÁVEIS DE AMBIENTE NOVAS

As seguintes variáveis de ambiente passaram a ser utilizadas (nenhuma existia antes como env var):

| Variável | Default | Onde |
|----------|---------|------|
| `GOOGLE_MAPS_API_KEY` | `''` (desabilitado) | googleMapsService.ts |
| `CORS_ORIGINS` | `'http://localhost:3000,http://localhost:5173'` | index.ts |
| `NODE_ENV` | (undefined → dev mode) | index.ts (sanitização de erros) |
| `REACT_APP_API_URL` | `'http://localhost:3001/api'` | MonitorGeracao.tsx, api.ts |

---

## 9. NOTAS FINAIS

1. **Nenhuma regra de negócio Equatorial foi alterada** — vãos, alturas, resistências, estruturas, condutores, aterramento, proteção e corrosividade permanecem conforme NT.00005–NT.00047.

2. **O pipeline expandiu de 7 para 10 etapas** no código (vs. 7 documentadas), mas essa expansão já existia antes do debug — apenas foi corrigido o funcionamento.

3. **O CONTEXTO_PROJETO.md precisa de atualização** para refletir: frontend implementado, 14 services (vs. 9), WebSocket, rotas separadas (`osRoutes` + `geracaoRoutes`), e as variáveis de ambiente novas.

4. **Compilação limpa:** `tsc --noEmit` retorna 0 erros tanto no backend quanto no frontend após todas as correções.
