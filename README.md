# ⚡ Motor de Geração Automática de Projetos Elétricos

Sistema que recebe **ponto de origem** (rede existente) e **ponto de destino** (cliente/comunidade) e gera automaticamente um projeto elétrico completo — **sem visita de campo**. O mapa é a única fonte de dados do mundo real.

**Distribuidora:** Grupo Equatorial Energia (PA, MA, PI, AL, RS, AP, GO)
**Normas:** NT.00005, NT.00006, NT.00007, NT.00008, NT.00018, NT.00022 (EQTL)

---

## Como funciona

```
Origem/Destino no mapa
        │
        ▼
┌─────────────────────────────────────────┐
│           PIPELINE 10 ETAPAS            │
│                                         │
│  1. Coleta OSM (ruas, rios, ferrovias)  │
│  2. Elevação SRTM                       │
│  3. Classificação terreno (MapBiomas)   │
│  4. Dados IBGE + Google Maps (opcional) │
│  5. Grid de custos por terreno          │
│  6. Roteamento A* seguindo ruas         │
│  7. Posicionamento de postes            │
│  8. Detecção de barreiras               │
│  9. Regras NT Equatorial + corrosão     │
│ 10. DXF + Lista de materiais            │
│                                         │
└─────────────────────────────────────────┘
        │
        ▼
  DXF + BOM + Relatório de barreiras
```

---

## Stack

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Frontend | React 18 + TypeScript + Leaflet | Mapa, formulários, WebSocket |
| Backend | Node.js + Express + TypeScript | API REST, pipeline de geração |
| Banco | PostgreSQL 15 + PostGIS | Dados geoespaciais |
| Infra | Docker Compose | PostgreSQL containerizado |

---

## Estrutura do projeto

```
projeto-rede-eletrica/
├── backend/
│   └── src/
│       ├── index.ts                          # Express + CORS + graceful shutdown
│       ├── db.ts                             # Pool PostgreSQL centralizado
│       ├── utils/geo.ts                      # Haversine, bearing, declive
│       ├── routes/
│       │   ├── osRoutes.ts                   # CRUD OS (validação + transações)
│       │   └── geracaoRoutes.ts              # Geração com lock de concorrência
│       └── services/
│           ├── geracaoService.ts             # Orquestrador (10 etapas)
│           ├── osmService.ts                 # Overpass API
│           ├── elevacaoService.ts            # SRTM
│           ├── terrenoService.ts             # Classificação de terreno
│           ├── roteamentoService.ts          # A* com grid de custos
│           ├── roteamentoInteligenteService.ts # Esquinas e otimização
│           ├── barreirasService.ts           # Rios, ferrovias, áreas verdes
│           ├── regrasEquatorialService.ts    # NT EQTL (vãos, alturas, corrosão)
│           ├── materiaisService.ts           # BOM por zona C2/C3/C4/C5
│           ├── dxfService.ts                 # DXF padrão Equatorial
│           ├── wsManager.ts                  # WebSocket + heartbeat
│           ├── googleMapsService.ts          # Google Maps (opcional)
│           └── fontesExternasService.ts      # IBGE/ANEEL
├── frontend/
│   └── src/
│       ├── App.tsx                           # Routes + ErrorBoundary
│       ├── pages/
│       │   ├── HomePage.tsx                  # Dashboard
│       │   ├── OSListPage.tsx                # Lista de OS
│       │   ├── OSFormPageV2.tsx              # Criar/editar OS com mapa
│       │   ├── GerarProjetoPage.tsx          # Geração + monitor
│       │   └── VisualizarProjetoPage.tsx     # Visualização do projeto
│       └── components/
│           ├── ErrorBoundary.tsx             # Captura erros React
│           ├── MapaProjeto.tsx               # Mapa Leaflet com camadas
│           ├── MonitorGeracao.tsx            # Progresso via WebSocket
│           ├── ListaErros.tsx               # Validações e export CSV
│           └── ControleCamadas.tsx           # Toggle de layers
└── docker-compose.yml
```

---

## Executando o projeto

### Pré-requisitos

- Docker e Docker Compose
- Node.js 18+

### 1. Banco de dados

```bash
docker-compose up -d
```

### 2. Backend (porta 3001)

```bash
cd backend
npm install
npm run dev
```

### 3. Frontend (porta 5173)

```bash
cd frontend
npm install
npm run dev
```

### Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DATABASE_URL` | `postgresql://...` | Conexão PostgreSQL |
| `PORT` | `3001` | Porta do backend |
| `GOOGLE_MAPS_API_KEY` | `''` | Google Maps (opcional) |
| `CORS_ORIGINS` | `localhost:3000,5173` | Origens CORS |
| `NODE_ENV` | `development` | Ambiente |
| `REACT_APP_API_URL` | `http://localhost:3001/api` | URL da API |

---

## API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/os` | Listar OS |
| POST | `/api/os` | Criar OS (com validação de coordenadas) |
| GET | `/api/os/:id` | Detalhes da OS |
| PUT | `/api/os/:id` | Atualizar OS |
| DELETE | `/api/os/:id` | Deletar OS (transação cascata) |
| POST | `/api/geracao/:id` | Gerar projeto (lock 409 se duplicado) |
| GET | `/api/geracao/:id/dxf` | Download DXF |

**WebSocket:** `ws://${hostname}:3001/ws` — progresso em tempo real com heartbeat 30s.

---

## O que já funciona (v1.0.0)

- [x] CRUD de OS com validação de coordenadas e transações
- [x] Consulta OSM via Overpass API (com graceful degradation)
- [x] Dados de elevação SRTM
- [x] Classificação de terreno (MapBiomas)
- [x] Detecção de barreiras (rios, ferrovias, áreas verdes)
- [x] Regras NT Equatorial (vãos, alturas, postes, condutores)
- [x] Zonas de corrosão NT.00008 (C2/C3/C4/C5) com seleção automática de materiais
- [x] Roteamento A* com grid de custos ponderado por terreno
- [x] Roteamento inteligente com detecção de esquinas
- [x] Posicionamento automático de postes
- [x] Lista de materiais (BOM) por zona de corrosão
- [x] Geração de DXF com layers padrão Equatorial
- [x] Orquestrador com pipeline de 10 etapas
- [x] WebSocket para monitoramento de progresso em tempo real
- [x] Frontend com mapa, formulários, visualização e download DXF
- [x] Error Boundary, lock de concorrência, graceful shutdown
- [x] CORS configurável, sanitização de erros em produção

---

## Roadmap

### Fase 2 — Frontend Avançado (Módulo 10)

- [ ] Mapa satélite (tiles Esri World Imagery)
- [ ] Camada de postes com marcadores coloridos por função
- [ ] Camada de condutores MT/BT com estilo
- [ ] Camada de barreiras com ícones por tipo
- [ ] Perfil altimétrico (Recharts)
- [ ] Painel de resumo do projeto
- [ ] Popups detalhados para postes e barreiras
- [ ] Toggle de camadas (satélite/mapa/híbrido)

### Fase 3 — IA Visual (Módulo 11)

- [ ] Visão computacional em imagens de satélite (Claude Vision / YOLO)
- [ ] Detecção de árvores, edificações, córregos não mapeados
- [ ] Cruzamento com dados OSM para validação
- [ ] Camada de validação visual no mapa

### Fase 4 — Multi-distribuidora

- [ ] Abstração `ConfigDistribuidora` (Equatorial, Energisa, CEMIG)
- [ ] Mapeamento de zonas de corrosão entre sistemas (C2-C5 ↔ P1/P2)
- [ ] Normas NDU (Energisa), normas CEMIG

---

## Documentação

| Arquivo | Conteúdo |
|---------|----------|
| `CONTEXTO_PROJETO.md` | Contexto completo, regras NT, pipeline, padrões |
| `PLANO_IMPLEMENTACAO.md` | Roadmap detalhado dos módulos 10 e 11 |
| `PADROES_DESENVOLVIMENTO.md` | Git Flow, Conventional Commits, versionamento |
| `RELATORIO_DEBUG.md` | 27 correções aplicadas (P0-P3) |
| `CHANGELOG.md` | Histórico de versões |
| `INSTALACAO.md` | Setup detalhado |
| `docs/API.md` | Documentação dos endpoints |
| `docs/ARQUITETURA.md` | Decisões de arquitetura |
| `docs/BANCO_DE_DADOS.md` | Modelagem e scripts SQL |

---

## Licença

Projeto privado — Todos os direitos reservados.
