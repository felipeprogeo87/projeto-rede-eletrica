# Arquitetura do Sistema

## 📐 Visão Geral da Arquitetura

O sistema segue uma arquitetura em três camadas (3-tier), separando claramente 
as responsabilidades entre apresentação, lógica de negócio e persistência de dados.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE APRESENTAÇÃO                        │
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │   React     │  │   Leaflet   │  │   Forms     │  │   Tables    │   │
│   │   Router    │  │   Maps      │  │             │  │             │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
│   Responsabilidade: Interface do usuário, navegação, exibição de dados  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/REST (JSON)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE NEGÓCIO                             │
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│   │   Express   │  │ Controllers │  │  Services   │  │ Middlewares │   │
│   │   Router    │  │             │  │             │  │             │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                                         │
│   Responsabilidade: Regras de negócio, validações, orquestração         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SQL (via pg driver)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE DADOS                               │
│                                                                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│   │ PostgreSQL  │  │   PostGIS   │  │   Índices   │                    │
│   │   Tables    │  │  Geography  │  │  Espaciais  │                    │
│   └─────────────┘  └─────────────┘  └─────────────┘                    │
│                                                                         │
│   Responsabilidade: Persistência, consultas espaciais, integridade      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de uma Requisição

Quando o usuário cria uma nova OS, o fluxo é:

```
1. Usuário preenche formulário no React
                │
                ▼
2. Frontend faz POST /api/os com JSON
                │
                ▼
3. Express recebe e roteia para OSController
                │
                ▼
4. Controller valida dados de entrada
                │
                ▼
5. Service aplica regras de negócio
                │
                ▼
6. Model executa INSERT no PostgreSQL
                │
                ▼
7. PostGIS converte coordenadas para GEOGRAPHY
                │
                ▼
8. Response volta com dados da OS criada
                │
                ▼
9. Frontend atualiza a interface
```

---

## 📁 Estrutura de Pastas Detalhada

### Backend

```
backend/
├── src/
│   ├── config/
│   │   └── database.ts        # Configuração da conexão PostgreSQL
│   │
│   ├── controllers/
│   │   └── OSController.ts    # Lógica dos endpoints de OS
│   │
│   ├── models/
│   │   └── OrdemServico.ts    # Modelo de dados e queries SQL
│   │
│   ├── routes/
│   │   ├── index.ts           # Agregador de todas as rotas
│   │   └── osRoutes.ts        # Rotas específicas de OS
│   │
│   ├── services/
│   │   └── OSService.ts       # Regras de negócio de OS
│   │
│   ├── middlewares/
│   │   ├── errorHandler.ts    # Tratamento global de erros
│   │   └── validator.ts       # Validação de entrada
│   │
│   ├── types/
│   │   └── index.ts           # Interfaces TypeScript
│   │
│   ├── utils/
│   │   └── helpers.ts         # Funções utilitárias
│   │
│   └── index.ts               # Ponto de entrada da aplicação
│
├── sql/
│   ├── 001_create_tables.sql  # Criação das tabelas
│   └── 002_seed_data.sql      # Dados de exemplo
│
├── package.json
├── tsconfig.json
└── .env.example
```

### Frontend

```
frontend/
├── src/
│   ├── components/
│   │   ├── common/            # Componentes genéricos
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Modal.tsx
│   │   │
│   │   ├── os/                # Componentes específicos de OS
│   │   │   ├── OSForm.tsx
│   │   │   ├── OSList.tsx
│   │   │   └── OSCard.tsx
│   │   │
│   │   └── map/               # Componentes de mapa
│   │       ├── MapView.tsx
│   │       └── MapMarker.tsx
│   │
│   ├── pages/
│   │   ├── HomePage.tsx       # Lista de OS
│   │   ├── OSDetailPage.tsx   # Detalhes de uma OS
│   │   └── OSFormPage.tsx     # Criar/Editar OS
│   │
│   ├── services/
│   │   ├── api.ts             # Configuração do axios
│   │   └── osService.ts       # Chamadas à API de OS
│   │
│   ├── types/
│   │   └── index.ts           # Interfaces TypeScript
│   │
│   ├── hooks/
│   │   └── useOS.ts           # Custom hook para OS
│   │
│   ├── styles/
│   │   └── global.css         # Estilos globais
│   │
│   ├── App.tsx                # Componente raiz com rotas
│   └── main.tsx               # Ponto de entrada
│
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🔧 Decisões de Arquitetura

### Por que PostgreSQL + PostGIS?

**Problema:** Precisamos armazenar e consultar dados geográficos (pontos, linhas, polígonos).

**Alternativas consideradas:**
1. MySQL + extensão espacial → Menos recursos que PostGIS
2. MongoDB com GeoJSON → Bom, mas perdemos integridade relacional
3. PostgreSQL + PostGIS → ✅ Escolhido

**Motivos da escolha:**
- PostGIS é o padrão da indústria para GIS
- Suporta o sistema de coordenadas EPSG:4326 (GPS)
- Funções como ST_Distance, ST_Within, ST_Intersects
- Índices espaciais GIST para performance
- Você já tem o PostgreSQL no Docker

### Por que Express e não Fastify/Koa?

**Problema:** Precisamos de um framework backend Node.js.

**Motivos da escolha:**
- Maior ecossistema e documentação
- Mais fácil de aprender (ideal para retomar programação)
- Middlewares abundantes
- Performance suficiente para o MVP

### Por que Leaflet e não Google Maps/Mapbox?

**Problema:** Precisamos de mapas interativos.

**Alternativas consideradas:**
1. Google Maps → Pago após cota, API key obrigatória
2. Mapbox → Mais bonito, mas pago
3. Leaflet + OpenStreetMap → ✅ Gratuito e open source

**Motivos da escolha:**
- 100% gratuito
- Sem necessidade de API key para começar
- Suficiente para o MVP
- React-Leaflet tem boa integração

---

## 🔐 Segurança (Futuro)

Para o MVP, não implementaremos autenticação, mas a arquitetura está preparada para:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAMADA DE SEGURANÇA                         │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │    JWT      │  │   RBAC      │  │   Rate      │            │
│   │   Tokens    │  │   Roles     │  │   Limiting  │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

Implementação futura:
- JWT para autenticação stateless
- Roles: admin, projetista, visualizador
- Rate limiting para proteger a API

---

## 📈 Escalabilidade (Considerações Futuras)

O sistema está preparado para evoluir:

```
Fase MVP (Atual)
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │────▶│ Backend  │────▶│   DB     │
│  React   │     │ Node.js  │     │ Postgres │
└──────────┘     └──────────┘     └──────────┘

Fase Produção (Futuro)
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   CDN    │────▶│  Nginx   │────▶│ Node.js  │────▶│ Postgres │
│          │     │  Load B. │     │ Cluster  │     │ Replica  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```
