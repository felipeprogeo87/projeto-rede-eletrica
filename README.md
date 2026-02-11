# Sistema de Projetos de Redes Elétricas

## 📋 Visão Geral

Sistema para automação de projetos de expansão de redes elétricas (primária e secundária) 
para distribuidoras de energia. O sistema permite cadastrar Ordens de Serviço (OS), 
visualizar a área do projeto em mapa interativo, traçar redes e gerar arquivos DXF.

## 🎯 Objetivo do MVP

Criar um protótipo funcional que demonstre a viabilidade de automatizar o processo de 
projeto de redes elétricas, incluindo:

1. Cadastro e gestão de Ordens de Serviço
2. Visualização georreferenciada da área do projeto
3. Traçado de redes com validação de regras técnicas
4. Geração de arquivos DXF padronizados

## 🏗️ Arquitetura do Sistema

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│   PostgreSQL    │
│  React + Maps   │     │  Node.js + TS   │     │    + PostGIS    │
│                 │◀────│                 │◀────│                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Tecnologias Utilizadas

| Camada    | Tecnologia                          | Motivo da Escolha                    |
|-----------|-------------------------------------|--------------------------------------|
| Frontend  | React 18 + TypeScript               | Componentização e tipagem forte      |
| Mapas     | Leaflet + React-Leaflet             | Open source, leve, boa documentação  |
| Backend   | Node.js + Express + TypeScript      | Stack unificada JS/TS                |
| Banco     | PostgreSQL 15 + PostGIS 3.3         | Consultas geoespaciais nativas       |
| Container | Docker + Docker Compose             | Ambiente consistente e isolado       |

## 📁 Estrutura de Pastas

```
projeto-rede-eletrica/
│
├── docs/                           # 📚 Documentação
│   ├── SPRINT1.md                  # Detalhamento do Sprint 1
│   ├── ARQUITETURA.md              # Decisões de arquitetura
│   ├── BANCO_DE_DADOS.md           # Modelagem e scripts SQL
│   └── API.md                      # Documentação dos endpoints
│
├── backend/                        # 🖥️ API REST
│   ├── src/
│   │   ├── config/                 # Configurações (banco, ambiente)
│   │   ├── controllers/            # Lógica dos endpoints
│   │   ├── models/                 # Modelos de dados
│   │   ├── routes/                 # Definição de rotas
│   │   ├── services/               # Regras de negócio
│   │   ├── middlewares/            # Validações, autenticação
│   │   ├── utils/                  # Funções utilitárias
│   │   └── index.ts                # Ponto de entrada
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                       # 🎨 Interface do Usuário
│   ├── src/
│   │   ├── components/             # Componentes reutilizáveis
│   │   ├── pages/                  # Páginas da aplicação
│   │   ├── services/               # Chamadas à API
│   │   ├── types/                  # Definições TypeScript
│   │   ├── hooks/                  # Custom hooks
│   │   └── App.tsx                 # Componente raiz
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml              # 🐳 Orquestração dos containers
└── README.md                       # Este arquivo
```

## 🚀 Como Executar o Projeto

### Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 18+ instalado
- Git instalado

### Passo 1: Subir o Banco de Dados

```bash
# Na raiz do projeto
docker-compose up -d

# Verificar se o container está rodando
docker ps
```

### Passo 2: Configurar e Rodar o Backend

```bash
# Entrar na pasta do backend
cd backend

# Instalar dependências
npm install

# Criar o banco de dados (primeira vez)
npm run db:setup

# Rodar em modo desenvolvimento
npm run dev
```

O backend estará disponível em: http://localhost:3001

### Passo 3: Configurar e Rodar o Frontend

```bash
# Em outro terminal, entrar na pasta do frontend
cd frontend

# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev
```

O frontend estará disponível em: http://localhost:5173

## 📅 Roadmap de Desenvolvimento

### Sprint 1 - Base do Sistema (Atual)
- [x] Estrutura do projeto
- [ ] Cadastro de OS (CRUD completo)
- [ ] Visualização de OS no mapa
- [ ] Documentação inicial

### Sprint 2 - Traçado Manual
- [ ] Desenhar linhas no mapa
- [ ] Inserir postes no traçado
- [ ] Salvar geometrias no PostGIS

### Sprint 3 - Motor de Regras
- [ ] Validação de distância entre postes
- [ ] Detecção de áreas restritas
- [ ] Alertas em tempo real

### Sprint 4 - Geração DXF
- [ ] Exportar traçado para DXF
- [ ] Aplicar layers padrão
- [ ] Simbologia de componentes

## 📞 Glossário

| Termo | Significado |
|-------|-------------|
| OS | Ordem de Serviço - solicitação de projeto |
| NDU | Norma de Distribuição Unificada - regras técnicas |
| Rede Primária | Alta tensão (geralmente 13.8kV) |
| Rede Secundária | Baixa tensão (220/380V) |
| DXF | Drawing Exchange Format - formato de arquivo CAD |
| PostGIS | Extensão espacial do PostgreSQL |
| Vão | Distância entre dois postes consecutivos |

## 📄 Licença

Projeto privado - Todos os direitos reservados.
