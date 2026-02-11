# Sprint 1 - Base do Sistema

## 📋 Objetivo

Construir a fundação do sistema com cadastro completo de Ordens de Serviço (OS) e 
visualização básica no mapa. Ao final deste sprint, você terá um sistema funcional
onde pode cadastrar uma OS e ver sua localização no mapa.

## 🎯 Entregas do Sprint

### Parte A - Cadastro de OS

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| Criar OS | Formulário com todos os campos necessários | Alta |
| Listar OS | Tabela com todas as OS cadastradas | Alta |
| Visualizar OS | Tela de detalhes de uma OS específica | Alta |
| Editar OS | Alterar dados de uma OS existente | Média |
| Excluir OS | Remover OS (com confirmação) | Média |
| Filtrar OS | Buscar por status, cliente, data | Baixa |

### Parte B - Visualização no Mapa

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| Exibir mapa | Mapa interativo com OpenStreetMap | Alta |
| Marcar origem | Pin no ponto de origem da OS | Alta |
| Marcar destino | Pin no ponto de destino da OS | Alta |
| Centralizar | Mapa centralizado entre origem e destino | Alta |

---

## 📊 Modelagem de Dados

### Tabela: ordens_servico

```sql
CREATE TABLE ordens_servico (
    -- Identificador único gerado automaticamente
    id SERIAL PRIMARY KEY,
    
    -- Número da OS (formato da empresa, ex: "OS-2024-001234")
    numero_os VARCHAR(50) NOT NULL UNIQUE,
    
    -- Dados do cliente solicitante
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_documento VARCHAR(20),          -- CPF ou CNPJ
    cliente_telefone VARCHAR(20),
    cliente_email VARCHAR(255),
    
    -- Endereço de referência (textual)
    endereco_referencia TEXT,
    
    -- Coordenadas geográficas de ORIGEM (ponto de conexão existente)
    -- Usamos o tipo GEOGRAPHY do PostGIS para cálculos precisos
    ponto_origem GEOGRAPHY(POINT, 4326) NOT NULL,
    
    -- Coordenadas geográficas de DESTINO (onde o cliente precisa de energia)
    ponto_destino GEOGRAPHY(POINT, 4326) NOT NULL,
    
    -- Tipo de rede a ser projetada
    tipo_rede VARCHAR(20) NOT NULL CHECK (tipo_rede IN ('primaria', 'secundaria', 'ambas')),
    
    -- Tipo de área (influencia nas regras de projeto)
    tipo_area VARCHAR(20) NOT NULL CHECK (tipo_area IN ('urbana', 'rural')),
    
    -- Carga solicitada em kW (determina bitola de cabos, transformador, etc.)
    carga_solicitada_kw DECIMAL(10,2),
    
    -- Tipo de fornecimento
    tipo_fornecimento VARCHAR(20) CHECK (tipo_fornecimento IN ('monofasico', 'bifasico', 'trifasico')),
    
    -- Classe de tensão
    tensao_primaria_kv DECIMAL(5,2) DEFAULT 13.8,
    tensao_secundaria_v INTEGER DEFAULT 220,
    
    -- Datas importantes
    data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
    prazo_entrega DATE,
    data_conclusao DATE,
    
    -- Status do projeto
    status VARCHAR(30) NOT NULL DEFAULT 'pendente' 
        CHECK (status IN ('pendente', 'em_analise', 'em_projeto', 'em_revisao', 'concluido', 'cancelado')),
    
    -- Observações livres
    observacoes TEXT,
    
    -- Controle de auditoria
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Índices para Performance

```sql
-- Índice espacial para buscas por proximidade
CREATE INDEX idx_os_origem_geo ON ordens_servico USING GIST (ponto_origem);
CREATE INDEX idx_os_destino_geo ON ordens_servico USING GIST (ponto_destino);

-- Índices para filtros comuns
CREATE INDEX idx_os_status ON ordens_servico(status);
CREATE INDEX idx_os_numero ON ordens_servico(numero_os);
CREATE INDEX idx_os_cliente ON ordens_servico(cliente_nome);
```

---

## 🔌 API REST - Endpoints

### Base URL: `http://localhost:3001/api`

### Ordens de Serviço

| Método | Endpoint | Descrição | Body |
|--------|----------|-----------|------|
| GET | `/os` | Lista todas as OS | - |
| GET | `/os/:id` | Busca OS por ID | - |
| POST | `/os` | Cria nova OS | JSON da OS |
| PUT | `/os/:id` | Atualiza OS | JSON da OS |
| DELETE | `/os/:id` | Remove OS | - |
| GET | `/os/status/:status` | Filtra por status | - |

### Exemplo de Request - Criar OS

```http
POST /api/os
Content-Type: application/json

{
    "numero_os": "OS-2024-000001",
    "cliente_nome": "João da Silva",
    "cliente_documento": "123.456.789-00",
    "cliente_telefone": "(84) 99999-8888",
    "cliente_email": "joao@email.com",
    "endereco_referencia": "Sítio Boa Vista, Zona Rural de Macaíba/RN",
    "ponto_origem": {
        "latitude": -5.8456,
        "longitude": -35.3456
    },
    "ponto_destino": {
        "latitude": -5.8489,
        "longitude": -35.3512
    },
    "tipo_rede": "secundaria",
    "tipo_area": "rural",
    "carga_solicitada_kw": 15.5,
    "tipo_fornecimento": "monofasico",
    "prazo_entrega": "2024-03-15",
    "observacoes": "Acesso pela estrada de terra após o posto de gasolina"
}
```

### Exemplo de Response

```json
{
    "success": true,
    "data": {
        "id": 1,
        "numero_os": "OS-2024-000001",
        "cliente_nome": "João da Silva",
        "status": "pendente",
        "criado_em": "2024-01-15T10:30:00Z"
    },
    "message": "OS criada com sucesso"
}
```

---

## 🎨 Interface do Usuário

### Telas do Sprint 1

#### 1. Lista de OS (`/`)
```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Ordens de Serviço                          [+ Nova OS]      │
├─────────────────────────────────────────────────────────────────┤
│  🔍 Buscar...                    Status: [Todos ▼]              │
├─────────────────────────────────────────────────────────────────┤
│  Nº OS          │ Cliente        │ Tipo    │ Status   │ Ações   │
│─────────────────┼────────────────┼─────────┼──────────┼─────────│
│  OS-2024-000001 │ João da Silva  │ Rural   │ Pendente │ 👁️ ✏️ 🗑️ │
│  OS-2024-000002 │ Maria Santos   │ Urbana  │ Em Proj. │ 👁️ ✏️ 🗑️ │
└─────────────────────────────────────────────────────────────────┘
```

#### 2. Formulário de OS (`/os/nova` e `/os/:id/editar`)
```
┌─────────────────────────────────────────────────────────────────┐
│  📝 Nova Ordem de Serviço                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Dados da OS ──────────────────────────────────────────────┐ │
│  │  Número OS: [OS-2024-000001    ]                           │ │
│  │  Status:    [Pendente ▼]                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Dados do Cliente ─────────────────────────────────────────┐ │
│  │  Nome:     [________________________]                      │ │
│  │  CPF/CNPJ: [______________]  Tel: [_______________]        │ │
│  │  Email:    [________________________]                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Localização ──────────────────────────────────────────────┐ │
│  │  Endereço: [________________________________________]      │ │
│  │                                                            │ │
│  │  Origem:  Lat [________] Lng [________]  📍               │ │
│  │  Destino: Lat [________] Lng [________]  📍               │ │
│  │                                                            │ │
│  │  ┌────────────────────────────────────────────────────┐   │ │
│  │  │                                                    │   │ │
│  │  │              🗺️ Mapa Interativo                    │   │ │
│  │  │         (clique para selecionar pontos)           │   │ │
│  │  │                                                    │   │ │
│  │  └────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Dados Técnicos ───────────────────────────────────────────┐ │
│  │  Tipo de Rede:  (•) Primária  ( ) Secundária  ( ) Ambas    │ │
│  │  Tipo de Área:  (•) Urbana    ( ) Rural                    │ │
│  │  Carga (kW):    [______]                                   │ │
│  │  Fornecimento:  [Monofásico ▼]                             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Prazos ───────────────────────────────────────────────────┐ │
│  │  Data Solicitação: [15/01/2024]                            │ │
│  │  Prazo Entrega:    [__/__/____]                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Observações:                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│                              [Cancelar]  [💾 Salvar]            │
└─────────────────────────────────────────────────────────────────┘
```

#### 3. Visualização de OS (`/os/:id`)
```
┌─────────────────────────────────────────────────────────────────┐
│  OS-2024-000001                    [✏️ Editar] [🗺️ Ver Mapa]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Status: 🟡 Pendente                                            │
│                                                                 │
│  ┌─ Cliente ────────────────┐  ┌─ Técnico ──────────────────┐  │
│  │ João da Silva            │  │ Rede: Secundária           │  │
│  │ CPF: 123.456.789-00      │  │ Área: Rural                │  │
│  │ Tel: (84) 99999-8888     │  │ Carga: 15.5 kW             │  │
│  │ joao@email.com           │  │ Fornec.: Monofásico        │  │
│  └──────────────────────────┘  └────────────────────────────┘  │
│                                                                 │
│  ┌─ Mapa ─────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │    🔴 Origem ─────────────────────────── 🟢 Destino       │ │
│  │                                                            │ │
│  │                    🗺️ Mapa com os pontos                   │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Distância estimada: 450m                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Tarefas Detalhadas

### Backend

- [ ] **B1.1** Configurar projeto Node.js + TypeScript
- [ ] **B1.2** Configurar conexão com PostgreSQL/PostGIS
- [ ] **B1.3** Criar modelo OrdemServico
- [ ] **B1.4** Implementar controller de OS
- [ ] **B1.5** Implementar rotas REST
- [ ] **B1.6** Criar script de setup do banco
- [ ] **B1.7** Testar endpoints com exemplos

### Frontend

- [ ] **F1.1** Configurar projeto React + TypeScript
- [ ] **F1.2** Configurar React Router
- [ ] **F1.3** Criar serviço de API (axios)
- [ ] **F1.4** Criar página de listagem de OS
- [ ] **F1.5** Criar formulário de OS
- [ ] **F1.6** Integrar Leaflet para mapa
- [ ] **F1.7** Criar página de visualização com mapa

---

## ✅ Critérios de Aceite

O Sprint 1 estará completo quando:

1. ✅ Consigo criar uma nova OS pelo formulário
2. ✅ Consigo ver a lista de todas as OS
3. ✅ Consigo clicar em uma OS e ver seus detalhes
4. ✅ Consigo ver os pontos de origem e destino no mapa
5. ✅ Consigo editar uma OS existente
6. ✅ Consigo excluir uma OS (com confirmação)
7. ✅ Os dados persistem no banco PostgreSQL
8. ✅ O mapa carrega corretamente com OpenStreetMap

---

## 🐛 Problemas Conhecidos e Soluções

### Erro de CORS
Se o frontend não conseguir acessar o backend, verifique se o CORS está configurado
no arquivo `backend/src/index.ts`.

### PostGIS não encontrado
Certifique-se de que o container Docker está usando a imagem `postgis/postgis` e
não apenas `postgres`.

### Mapa não carrega
Verifique se o CSS do Leaflet está sendo importado no componente do mapa.
