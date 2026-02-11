# Changelog

Todas as alterações notáveis do projeto serão documentadas neste arquivo.  
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).  
Versionamento segue [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [Unreleased]

### A fazer
- Módulo 10: Frontend avançado (mapa satélite, perfil altimétrico, camadas de barreiras)

---

## [1.0.1] - 2026-02-11

### Corrigido

**P0 — Críticos (app não funcionava)**
- fix(frontend): response shape mismatch — backend retorna flat, frontend esperava `data.data` (OSFormPageV2, VisualizarProjetoPage)
- fix(frontend): URLs de API incorretas — MonitorGeracao e VisualizarProjetoPage apontavam endpoints errados
- fix(geracao): ValidacaoItem mapeava campos inexistentes (`.tipo/.detalhe`) em vez dos corretos (`.campo/.valor/.esperado`)
- fix(frontend): WebSocket URL hardcoded — agora usa `ws://${hostname}:3001/ws`

**P1 — Alto (crashes em runtime)**
- fix(geracao): divisão por zero no cálculo de vão médio quando 0 ou 1 poste
- fix(roteamento): divisão por zero em roteamentoInteligenteService quando pontos coincidentes (`distDir = 0`)
- fix(roteamento): ID de esquinas sempre 0 — usava `esquinas.length` (vazio) em vez de `esquinasMap.size`
- fix(barreiras): filtros inválidos `'floresta'`/`'parque'` corrigidos para `'area_verde'`
- fix(osm): crash quando Overpass API retorna sem `elements` — adicionado null guard
- fix(roteamento): type assertion incorreta para `OSRMResponse`
- fix(frontend): `simularProgresso` não chamava `onComplete` ao finalizar
- fix(backend): DELETE de OS sem transação — adicionado BEGIN/COMMIT/ROLLBACK para cascata

**P2 — Segurança e Estabilidade**
- fix(backend): API key do Google Maps hardcoded removida — agora via `GOOGLE_MAPS_API_KEY` env var
- fix(backend): CORS aberto para qualquer origem — restrito via `CORS_ORIGINS` env var
- fix(backend): stack trace completo enviado ao cliente em produção — sanitizado quando `NODE_ENV=production`
- fix(geracao): NaN guard para parseFloat de coordenadas do banco
- fix(backend): conexões WebSocket mortas permaneciam — adicionado heartbeat ping/pong 30s
- fix(frontend): memory leak em ListaErros — `URL.revokeObjectURL` após download
- fix(backend): sem graceful shutdown — adicionado SIGTERM/SIGINT → fecha HTTP + pool DB
- feat(backend): lock de concorrência na geração — 409 Conflict se mesma OS em andamento
- feat(backend): validação de coordenadas no POST de OS (faixas lat/lng, tipo numérico)

### Adicionado
- feat(frontend): ErrorBoundary.tsx — captura erros React com UI de fallback e stack trace
- docs: PADROES_DESENVOLVIMENTO.md — git flow, commits, changelog, kanban
- docs: CHANGELOG.md — registro de alterações

### Alterado
- refactor(backend): `require()` dinâmico substituído por `import` em geracaoRoutes
- refactor(frontend): tipo `CamadasVisiveis` duplicado removido de ControleCamadas (importa de MapaProjeto)
- refactor(frontend): clone profundo de `ETAPAS_INICIAL` em MonitorGeracao para evitar mutação
- refactor(frontend): `localizarNoMapa` de no-op para abrir visualização em nova aba

### Deprecated
- useWebSocket.ts — não utilizado, MonitorGeracao implementa WebSocket inline
- services/api.ts — não importado, componentes usam fetch() direto

---

## [1.0.0] - 2026-02-11

### Adicionado

**Backend — Motor de Geração (14 services)**
- Módulo 1: Elevação SRTM com resolução 30m (elevacaoService.ts)
- Módulo 2: Classificação de terreno via MapBiomas (terrenoService.ts)
- Módulo 3: Detecção de barreiras — rios, ferrovias, florestas, alagados (barreirasService.ts)
- Módulo 4: Regras NT Equatorial — vãos, alturas, postes, condutores (regrasNDUService.ts)
- Módulo 5: Roteamento A* com grid de custos por tipo de terreno (roteamentoService.ts)
- Módulo 5b: Roteamento inteligente com detecção de esquinas (roteamentoInteligenteService.ts)
- Módulo 6: Lista de materiais com seleção por zona de corrosão C2/C3/C4/C5 (materiaisService.ts)
- Módulo 7: Geração de DXF com layers padrão Equatorial (dxfService.ts)
- Módulo 8: Orquestrador do pipeline de 10 etapas (geracaoService.ts)
- Módulo 9: Rotas API REST e tipagens TypeScript completas
- Posicionamento de postes (posicionamentoService.ts)
- Integração Google Maps opcional (googleMapsService.ts)
- Dados IBGE/ANEEL (ibgeService.ts)
- WebSocket com heartbeat (wsManager.ts)

**Frontend — Implementação completa**
- CRUD de Ordens de Serviço com formulário e validação
- Seleção de origem/destino no mapa interativo (React-Leaflet)
- Página de geração de projeto com monitoramento WebSocket
- Página de visualização do projeto gerado com download DXF
- Mapa com controle de camadas

**Infraestrutura**
- Pool PostgreSQL centralizado (db.ts)
- Funções geoespaciais reutilizáveis — haversine, bearing, etc. (utils/geo.ts)
- Consulta OSM via Overpass API (osmService.ts)
- Docker Compose para PostgreSQL

**Regras técnicas implementadas**
- Classificação automática de zona de corrosão por distância da orla (C2/C3/C4/C5)
- Zonas especiais do Maranhão — Ilha de São Luís até Estreito e Barreirinhas
- Seleção de condutores MT por zona (CA/CAA em C2/C3, CAL 6201 em C4/C5)
- Seleção de condutores BT por zona (neutro nu até C4, neutro isolado em C5)
- Seleção de materiais por zona: isoladores, ferragens, pré-formados, chaves fusíveis
- Postes de fibra de vidro obrigatórios em C5
- Áreas especiais: cana-de-açúcar e alagados salinos

### Normas implementadas
- NT.00005.EQTL Rev.05 — Critérios de Projetos de Redes de Distribuição (30/12/2025)
- NT.00006.EQTL Rev.04 — Padrão de Estruturas 13,8kV e BT 380/220V e 220/127V (30/12/2025)
- NT.00007.EQTL Rev.06 — Padrão de Estruturas para Equipamentos (29/12/2025)
- NT.00008.EQTL Rev.03 — Padronização de Materiais por Tipo de Ambiente (29/12/2025)
- NT.00022.EQTL Rev.04 — Padrão de Estruturas 23,1kV e 34,5kV (30/12/2025)
