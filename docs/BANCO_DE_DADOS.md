# Banco de Dados

## 📊 Visão Geral

O sistema utiliza PostgreSQL 15 com a extensão PostGIS 3.3 para suporte a dados geoespaciais.
O banco roda em container Docker para facilitar o setup e garantir consistência entre ambientes.

---

## 🐳 Configuração Docker

O banco é configurado via `docker-compose.yml` na raiz do projeto:

```yaml
services:
  postgres:
    image: postgis/postgis:15-3.3
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: rede_eletrica
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev123
    volumes:
      - pgdata:/var/lib/postgresql/data
```

**Por que `postgis/postgis` e não apenas `postgres`?**

A imagem oficial `postgres` não inclui a extensão PostGIS. Usamos a imagem 
`postgis/postgis` que já vem com tudo instalado e configurado.

---

## 📐 Modelo Entidade-Relacionamento

```
┌─────────────────────────────────────────────────────────────────┐
│                        ordens_servico                           │
├─────────────────────────────────────────────────────────────────┤
│ PK │ id                    SERIAL                               │
├────┼────────────────────────────────────────────────────────────┤
│    │ numero_os             VARCHAR(50)      NOT NULL UNIQUE     │
│    │ cliente_nome          VARCHAR(255)     NOT NULL            │
│    │ cliente_documento     VARCHAR(20)                          │
│    │ cliente_telefone      VARCHAR(20)                          │
│    │ cliente_email         VARCHAR(255)                         │
│    │ endereco_referencia   TEXT                                 │
│    │ ponto_origem          GEOGRAPHY(POINT) NOT NULL            │
│    │ ponto_destino         GEOGRAPHY(POINT) NOT NULL            │
│    │ tipo_rede             VARCHAR(20)      NOT NULL            │
│    │ tipo_area             VARCHAR(20)      NOT NULL            │
│    │ carga_solicitada_kw   DECIMAL(10,2)                        │
│    │ tipo_fornecimento     VARCHAR(20)                          │
│    │ tensao_primaria_kv    DECIMAL(5,2)     DEFAULT 13.8        │
│    │ tensao_secundaria_v   INTEGER          DEFAULT 220         │
│    │ data_solicitacao      DATE             DEFAULT CURRENT_DATE│
│    │ prazo_entrega         DATE                                 │
│    │ data_conclusao        DATE                                 │
│    │ status                VARCHAR(30)      DEFAULT 'pendente'  │
│    │ observacoes           TEXT                                 │
│    │ criado_em             TIMESTAMP        DEFAULT NOW()       │
│    │ atualizado_em         TIMESTAMP        DEFAULT NOW()       │
└────┴────────────────────────────────────────────────────────────┘
```

---

## 🌍 Entendendo PostGIS e Coordenadas

### O que é GEOGRAPHY?

GEOGRAPHY é um tipo de dado do PostGIS que armazena coordenadas geográficas 
(latitude/longitude) considerando a curvatura da Terra. Isso é importante porque:

- Cálculos de distância são precisos (em metros)
- Funciona corretamente em qualquer lugar do planeta
- Usa o sistema de referência WGS84 (EPSG:4326) - o mesmo do GPS

### Como criar um ponto geográfico?

```sql
-- Sintaxe: ST_MakePoint(longitude, latitude)
-- ATENÇÃO: longitude vem PRIMEIRO!

INSERT INTO ordens_servico (numero_os, cliente_nome, ponto_origem, ponto_destino, ...)
VALUES (
    'OS-2024-001',
    'João',
    ST_SetSRID(ST_MakePoint(-35.3456, -5.8456), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-35.3512, -5.8489), 4326)::geography,
    ...
);
```

**Explicação passo a passo:**

1. `ST_MakePoint(-35.3456, -5.8456)` → Cria um ponto com longitude -35.3456 e latitude -5.8456
2. `ST_SetSRID(..., 4326)` → Define o sistema de coordenadas como WGS84 (padrão GPS)
3. `::geography` → Converte para o tipo GEOGRAPHY

### Como extrair latitude e longitude?

```sql
SELECT 
    numero_os,
    ST_Y(ponto_origem::geometry) as origem_latitude,
    ST_X(ponto_origem::geometry) as origem_longitude,
    ST_Y(ponto_destino::geometry) as destino_latitude,
    ST_X(ponto_destino::geometry) as destino_longitude
FROM ordens_servico;
```

### Como calcular distância entre dois pontos?

```sql
-- Distância em metros entre origem e destino
SELECT 
    numero_os,
    ST_Distance(ponto_origem, ponto_destino) as distancia_metros
FROM ordens_servico;
```

---

## 📝 Scripts SQL

### Criação das Tabelas

Arquivo: `backend/sql/001_create_tables.sql`

```sql
-- Habilita a extensão PostGIS (já vem habilitada na imagem Docker, mas garantimos)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabela principal de Ordens de Serviço
CREATE TABLE IF NOT EXISTS ordens_servico (
    -- Chave primária auto-incremento
    id SERIAL PRIMARY KEY,
    
    -- Número único da OS (formato da empresa)
    numero_os VARCHAR(50) NOT NULL UNIQUE,
    
    -- Dados do cliente
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_documento VARCHAR(20),
    cliente_telefone VARCHAR(20),
    cliente_email VARCHAR(255),
    
    -- Localização textual
    endereco_referencia TEXT,
    
    -- Pontos geográficos (PostGIS)
    ponto_origem GEOGRAPHY(POINT, 4326) NOT NULL,
    ponto_destino GEOGRAPHY(POINT, 4326) NOT NULL,
    
    -- Classificação técnica
    tipo_rede VARCHAR(20) NOT NULL CHECK (tipo_rede IN ('primaria', 'secundaria', 'ambas')),
    tipo_area VARCHAR(20) NOT NULL CHECK (tipo_area IN ('urbana', 'rural')),
    
    -- Dados de carga
    carga_solicitada_kw DECIMAL(10,2),
    tipo_fornecimento VARCHAR(20) CHECK (tipo_fornecimento IN ('monofasico', 'bifasico', 'trifasico')),
    
    -- Tensões
    tensao_primaria_kv DECIMAL(5,2) DEFAULT 13.8,
    tensao_secundaria_v INTEGER DEFAULT 220,
    
    -- Datas
    data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
    prazo_entrega DATE,
    data_conclusao DATE,
    
    -- Status do fluxo
    status VARCHAR(30) NOT NULL DEFAULT 'pendente' 
        CHECK (status IN ('pendente', 'em_analise', 'em_projeto', 'em_revisao', 'concluido', 'cancelado')),
    
    -- Observações
    observacoes TEXT,
    
    -- Auditoria
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices espaciais para consultas geográficas rápidas
CREATE INDEX IF NOT EXISTS idx_os_origem_geo ON ordens_servico USING GIST (ponto_origem);
CREATE INDEX IF NOT EXISTS idx_os_destino_geo ON ordens_servico USING GIST (ponto_destino);

-- Índices para filtros comuns
CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_numero ON ordens_servico(numero_os);

-- Função para atualizar o campo atualizado_em automaticamente
CREATE OR REPLACE FUNCTION update_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger que executa a função antes de cada UPDATE
CREATE TRIGGER trigger_update_atualizado_em
    BEFORE UPDATE ON ordens_servico
    FOR EACH ROW
    EXECUTE FUNCTION update_atualizado_em();
```

### Dados de Exemplo

Arquivo: `backend/sql/002_seed_data.sql`

```sql
-- Dados de exemplo para desenvolvimento e testes
-- Localização: Região de Natal/RN

INSERT INTO ordens_servico (
    numero_os, cliente_nome, cliente_documento, cliente_telefone, cliente_email,
    endereco_referencia, ponto_origem, ponto_destino,
    tipo_rede, tipo_area, carga_solicitada_kw, tipo_fornecimento,
    prazo_entrega, status, observacoes
) VALUES 
(
    'OS-2024-000001',
    'João da Silva',
    '123.456.789-00',
    '(84) 99999-1111',
    'joao@email.com',
    'Sítio Boa Vista, Zona Rural de Macaíba/RN',
    ST_SetSRID(ST_MakePoint(-35.3456, -5.8456), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-35.3512, -5.8489), 4326)::geography,
    'secundaria',
    'rural',
    15.50,
    'monofasico',
    '2024-03-15',
    'pendente',
    'Acesso pela estrada de terra após o posto Shell'
),
(
    'OS-2024-000002',
    'Maria Santos Ltda',
    '12.345.678/0001-90',
    '(84) 3333-2222',
    'contato@mariasantos.com.br',
    'Av. Prudente de Morais, 500 - Natal/RN',
    ST_SetSRID(ST_MakePoint(-35.2094, -5.7945), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-35.2087, -5.7952), 4326)::geography,
    'primaria',
    'urbana',
    150.00,
    'trifasico',
    '2024-02-28',
    'em_projeto',
    'Prédio comercial novo, entrada de energia pela lateral'
),
(
    'OS-2024-000003',
    'Fazenda Esperança',
    '98.765.432/0001-10',
    '(84) 99888-7777',
    'fazenda.esperanca@email.com',
    'Estrada RN-160, Km 15 - São Gonçalo do Amarante/RN',
    ST_SetSRID(ST_MakePoint(-35.3234, -5.7823), 4326)::geography,
    ST_SetSRID(ST_MakePoint(-35.3312, -5.7901), 4326)::geography,
    'ambas',
    'rural',
    250.00,
    'trifasico',
    '2024-04-30',
    'em_analise',
    'Projeto de irrigação, necessita transformador dedicado'
);
```

---

## 🔍 Consultas Úteis

### Listar todas as OS com coordenadas legíveis

```sql
SELECT 
    id,
    numero_os,
    cliente_nome,
    status,
    ST_Y(ponto_origem::geometry) as origem_lat,
    ST_X(ponto_origem::geometry) as origem_lng,
    ST_Y(ponto_destino::geometry) as destino_lat,
    ST_X(ponto_destino::geometry) as destino_lng,
    ROUND(ST_Distance(ponto_origem, ponto_destino)::numeric, 2) as distancia_metros
FROM ordens_servico
ORDER BY criado_em DESC;
```

### Buscar OS num raio de 10km de um ponto

```sql
SELECT *
FROM ordens_servico
WHERE ST_DWithin(
    ponto_origem,
    ST_SetSRID(ST_MakePoint(-35.2094, -5.7945), 4326)::geography,
    10000  -- 10km em metros
);
```

### Contar OS por status

```sql
SELECT status, COUNT(*) as quantidade
FROM ordens_servico
GROUP BY status
ORDER BY quantidade DESC;
```

---

## 🔧 Comandos Úteis

### Acessar o banco via terminal

```bash
# Conectar ao container PostgreSQL
docker exec -it projeto-rede-eletrica-postgres-1 psql -U dev -d rede_eletrica

# Ou via pgAdmin que você já tem configurado
```

### Verificar se PostGIS está instalado

```sql
SELECT PostGIS_Version();
-- Deve retornar algo como: 3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1
```

### Backup do banco

```bash
docker exec projeto-rede-eletrica-postgres-1 pg_dump -U dev rede_eletrica > backup.sql
```

### Restore do banco

```bash
cat backup.sql | docker exec -i projeto-rede-eletrica-postgres-1 psql -U dev -d rede_eletrica
```
