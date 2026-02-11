# Documentação da API REST

## 📋 Visão Geral

A API REST do Sistema de Projetos de Redes Elétricas permite gerenciar Ordens de Serviço (OS) através de endpoints HTTP.

**Base URL:** `http://localhost:3001/api`

**Formato:** Todas as requisições e respostas usam JSON.

---

## 🔐 Autenticação

A versão atual (MVP) não requer autenticação. Em versões futuras, implementaremos JWT.

---

## 📦 Formato de Resposta Padrão

Todas as respostas seguem este formato:

```json
{
  "success": true | false,
  "data": { ... } | [ ... ] | null,
  "message": "Descrição do resultado",
  "error": "Detalhes do erro (apenas quando success = false)"
}
```

---

## 🛣️ Endpoints

### Health Check

#### `GET /api/health`

Verifica se a API está funcionando.

**Resposta:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

---

### Ordens de Serviço

#### `GET /api/os`

Lista todas as Ordens de Serviço.

**Exemplo de requisição:**
```bash
curl http://localhost:3001/api/os
```

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "numero_os": "OS-2024-000001",
      "cliente_nome": "João da Silva",
      "cliente_documento": "123.456.789-00",
      "cliente_telefone": "(84) 99999-1111",
      "cliente_email": "joao@email.com",
      "endereco_referencia": "Sítio Boa Vista...",
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
      "tensao_primaria_kv": 13.8,
      "tensao_secundaria_v": 220,
      "data_solicitacao": "2024-01-15",
      "prazo_entrega": "2024-03-15",
      "data_conclusao": null,
      "status": "pendente",
      "observacoes": "Acesso pela estrada...",
      "criado_em": "2024-01-15T10:30:00.000Z",
      "atualizado_em": "2024-01-15T10:30:00.000Z",
      "distancia_metros": 450.23
    }
  ],
  "message": "1 ordem(ns) de serviço encontrada(s)"
}
```

---

#### `GET /api/os/:id`

Busca uma OS específica pelo ID.

**Parâmetros de URL:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | number | ID da OS |

**Exemplo:**
```bash
curl http://localhost:3001/api/os/1
```

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "numero_os": "OS-2024-000001",
    ...
  },
  "message": "Ordem de serviço encontrada"
}
```

**Resposta de erro (404):**
```json
{
  "success": false,
  "message": "Ordem de serviço não encontrada"
}
```

---

#### `GET /api/os/status/:status`

Lista OS filtradas por status.

**Parâmetros de URL:**
| Parâmetro | Tipo | Valores Válidos |
|-----------|------|-----------------|
| status | string | pendente, em_analise, em_projeto, em_revisao, concluido, cancelado |

**Exemplo:**
```bash
curl http://localhost:3001/api/os/status/pendente
```

---

#### `GET /api/os/stats/count`

Retorna contagem de OS por status.

**Exemplo:**
```bash
curl http://localhost:3001/api/os/stats/count
```

**Resposta (200):**
```json
{
  "success": true,
  "data": {
    "pendente": 2,
    "em_analise": 1,
    "em_projeto": 1,
    "em_revisao": 1,
    "concluido": 1,
    "cancelado": 0
  },
  "message": "Estatísticas de OS"
}
```

---

#### `POST /api/os`

Cria uma nova Ordem de Serviço.

**Headers:**
```
Content-Type: application/json
```

**Corpo da requisição:**
```json
{
  "numero_os": "OS-2024-000007",
  "cliente_nome": "Empresa Teste Ltda",
  "cliente_documento": "12.345.678/0001-90",
  "cliente_telefone": "(84) 3333-4444",
  "cliente_email": "contato@teste.com",
  "endereco_referencia": "Rua Exemplo, 100 - Natal/RN",
  "ponto_origem": {
    "latitude": -5.7945,
    "longitude": -35.2094
  },
  "ponto_destino": {
    "latitude": -5.7952,
    "longitude": -35.2087
  },
  "tipo_rede": "secundaria",
  "tipo_area": "urbana",
  "carga_solicitada_kw": 25.0,
  "tipo_fornecimento": "bifasico",
  "prazo_entrega": "2024-04-30",
  "observacoes": "Observações do projeto"
}
```

**Campos obrigatórios:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| numero_os | string | Número único da OS |
| cliente_nome | string | Nome do cliente |
| ponto_origem | object | { latitude, longitude } |
| ponto_destino | object | { latitude, longitude } |
| tipo_rede | string | primaria, secundaria, ambas |
| tipo_area | string | urbana, rural |

**Campos opcionais:**
| Campo | Tipo | Padrão |
|-------|------|--------|
| cliente_documento | string | null |
| cliente_telefone | string | null |
| cliente_email | string | null |
| endereco_referencia | string | null |
| carga_solicitada_kw | number | null |
| tipo_fornecimento | string | null |
| tensao_primaria_kv | number | 13.8 |
| tensao_secundaria_v | number | 220 |
| data_solicitacao | string | data atual |
| prazo_entrega | string | null |
| status | string | "pendente" |
| observacoes | string | null |

**Exemplo com curl:**
```bash
curl -X POST http://localhost:3001/api/os \
  -H "Content-Type: application/json" \
  -d '{
    "numero_os": "OS-2024-000007",
    "cliente_nome": "Teste",
    "ponto_origem": {"latitude": -5.79, "longitude": -35.20},
    "ponto_destino": {"latitude": -5.80, "longitude": -35.21},
    "tipo_rede": "secundaria",
    "tipo_area": "urbana"
  }'
```

**Resposta de sucesso (201):**
```json
{
  "success": true,
  "data": {
    "id": 7,
    "numero_os": "OS-2024-000007",
    ...
  },
  "message": "Ordem de serviço criada com sucesso"
}
```

**Possíveis erros (400):**
- "O campo numero_os é obrigatório"
- "Já existe uma OS com este número"
- "O campo cliente_nome é obrigatório"
- "O campo ponto_origem com latitude e longitude é obrigatório"
- "Coordenadas de origem fora dos limites do Brasil"

---

#### `PUT /api/os/:id`

Atualiza uma OS existente.

**Parâmetros de URL:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | number | ID da OS |

**Corpo:** Apenas os campos a atualizar (todos opcionais)

**Exemplo:**
```bash
curl -X PUT http://localhost:3001/api/os/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "em_projeto", "observacoes": "Projeto iniciado"}'
```

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Ordem de serviço atualizada com sucesso"
}
```

---

#### `DELETE /api/os/:id`

Remove uma OS.

**Parâmetros de URL:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| id | number | ID da OS |

**Exemplo:**
```bash
curl -X DELETE http://localhost:3001/api/os/1
```

**Resposta de sucesso (200):**
```json
{
  "success": true,
  "data": { "id": 1 },
  "message": "Ordem de serviço removida com sucesso"
}
```

---

## 📊 Códigos de Status HTTP

| Código | Significado | Quando ocorre |
|--------|-------------|---------------|
| 200 | OK | Requisição bem sucedida |
| 201 | Created | Recurso criado com sucesso |
| 400 | Bad Request | Dados inválidos ou faltando |
| 404 | Not Found | Recurso não encontrado |
| 500 | Internal Error | Erro no servidor |

---

## 🧪 Testando com cURL

```bash
# Listar todas as OS
curl http://localhost:3001/api/os

# Buscar OS por ID
curl http://localhost:3001/api/os/1

# Criar nova OS
curl -X POST http://localhost:3001/api/os \
  -H "Content-Type: application/json" \
  -d '{"numero_os":"OS-TEST-001","cliente_nome":"Teste","ponto_origem":{"latitude":-5.79,"longitude":-35.20},"ponto_destino":{"latitude":-5.80,"longitude":-35.21},"tipo_rede":"secundaria","tipo_area":"urbana"}'

# Atualizar status
curl -X PUT http://localhost:3001/api/os/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"em_projeto"}'

# Deletar OS
curl -X DELETE http://localhost:3001/api/os/1
```
