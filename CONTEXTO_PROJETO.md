# CONTEXTO DO PROJETO — Motor de Geração Automática de Projetos Elétricos

**Autor:** Felipe Fernandes  
**Stack:** Node.js + Express + TypeScript + PostgreSQL  
**Distribuidora:** Grupo Equatorial Energia (PA, MA, PI, AL, RS, AP, GO)  
**Normas:** NT.00005, NT.00006, NT.00007, NT.00008, NT.00018, NT.00022 (todas EQTL)  
**Normas ABNT:** NBR ISO 9233:2024, IEC/TR 60815:2005  
**Especificações Técnicas:** ET.00003, ET.00004, ET.00014 (todas EQTL)

---

## 1. O QUE O SISTEMA FAZ

O sistema recebe **ponto de origem** (rede existente) e **ponto de destino** (cliente/comunidade) e gera automaticamente um projeto elétrico completo, **sem visita de campo**. O mapa é a ÚNICA fonte de dados do mundo real, substituindo o técnico de campo.

### Fluxo resumido:
1. Usuário cria Ordem de Serviço com origem/destino no mapa
2. Sistema busca dados geoespaciais (ruas, terreno, elevação, rede existente)
3. Algoritmo A* calcula melhor rota seguindo ruas
4. Posiciona postes ao longo da rota respeitando vãos máximos
5. Detecta barreiras (rios, ferrovias, florestas, alagados)
6. Aplica regras NT Equatorial (incluindo zonas de corrosão NT.00008)
7. Gera saída: DXF, lista de materiais, relatório de barreiras

---

## 2. CONCESSIONÁRIAS DO GRUPO EQUATORIAL

| Estado | Sedes Regionais | Telefone |
|--------|----------------|----------|
| PA | Belém, Castanhal, Marabá, Santarém, Altamira | 0800 280 3216 |
| MA | São Luís, Bacabal, Pinheiro, Timon, Imperatriz | 0800 280 2800 |
| PI | Teresina, Parnaíba, Floriano | 0800 086 8500 |
| AL | Maceió, Arapiraca | 0800 082 8500 |
| RS | Porto Alegre, Osório, Pelotas | 0800 721 2333 |
| AP | Macapá | 0800 091 0116 |
| GO | Goiânia, Luziânia, Anápolis, Rio Verde, São Luis de Montes Belos, Morrinhos, Uruaçu, Iporá | 0800 062 0198 |

---

## 3. ESTADO ATUAL DO CÓDIGO

### Estrutura de pastas:
```
projeto-rede-eletrica/
├── backend/
│   ├── src/
│   │   ├── index.ts               # Express + CORS + graceful shutdown
│   │   ├── db.ts                  # Pool PostgreSQL centralizado
│   │   ├── utils/
│   │   │   └── geo.ts             # Funções geoespaciais reutilizáveis
│   │   ├── routes/
│   │   │   ├── osRoutes.ts        # CRUD de Ordens de Serviço (validação + transações)
│   │   │   └── geracaoRoutes.ts   # POST /api/gerar-projeto (lock de concorrência)
│   │   ├── services/
│   │   │   ├── osmService.ts               # Consultas Overpass API (com null guard)
│   │   │   ├── elevacaoService.ts          # Dados SRTM
│   │   │   ├── terrenoService.ts           # Classificação MapBiomas
│   │   │   ├── barreirasService.ts         # Detecção de obstáculos
│   │   │   ├── regrasNDUService.ts         # Regras NT Equatorial
│   │   │   ├── roteamentoService.ts        # A* com grid de custos
│   │   │   ├── roteamentoInteligenteService.ts  # Roteamento avançado com esquinas
│   │   │   ├── posicionamentoService.ts    # Posicionamento de postes
│   │   │   ├── materiaisService.ts         # Lista de materiais por zona corrosão
│   │   │   ├── dxfService.ts               # Geração de DXF
│   │   │   ├── geracaoService.ts           # Orquestrador principal (10 etapas)
│   │   │   ├── googleMapsService.ts        # Google Maps API (env var, graceful)
│   │   │   ├── ibgeService.ts              # Dados IBGE/ANEEL
│   │   │   └── wsManager.ts               # WebSocket com heartbeat ping/pong
│   │   └── types/
│   │       └── index.ts            # Tipagens TypeScript
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                        # Routes + ErrorBoundary
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── OSListPage.tsx
│   │   │   ├── OSFormPageV2.tsx           # Formulário criação/edição OS
│   │   │   ├── GerarProjetoPage.tsx       # Mapa + geração de projeto
│   │   │   └── VisualizarProjetoPage.tsx  # Visualização do projeto gerado
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx          # Captura erros React em runtime
│   │   │   ├── MapaProjeto.tsx            # Mapa Leaflet com camadas
│   │   │   ├── MonitorGeracao.tsx         # Progresso via WebSocket
│   │   │   ├── ListaErros.tsx             # Exibição de erros/validações
│   │   │   └── ControleCamadas.tsx        # Toggle de layers do mapa
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts            # @deprecated (não utilizado)
│   │   └── services/
│   │       └── api.ts                     # @deprecated (não utilizado)
│   ├── package.json
│   └── vite.config.ts
└── docker-compose.yml                     # PostgreSQL
```

### O que já funciona (FASE 1 Backend + FASE 1.5 Frontend):
- ✅ CRUD de Ordens de Serviço com validação de coordenadas e transações
- ✅ Seleção de origem/destino no mapa (Leaflet)
- ✅ Consulta OSM via Overpass API (com graceful degradation)
- ✅ Dados de elevação SRTM
- ✅ Classificação de terreno (MapBiomas)
- ✅ Detecção de barreiras (rios, ferrovias, florestas, áreas verdes)
- ✅ Regras NT Equatorial (vãos, alturas, postes, condutores, zonas de corrosão)
- ✅ Roteamento A* com grid de custos baseado em terreno
- ✅ Roteamento inteligente com detecção de esquinas
- ✅ Posicionamento automático de postes respeitando vãos máximos
- ✅ Geração de lista de materiais (com seleção por zona de corrosão)
- ✅ Geração de DXF
- ✅ Orquestrador (geracaoService) com pipeline de 10 etapas
- ✅ WebSocket para monitoramento de progresso em tempo real
- ✅ Frontend com mapa, formulários, visualização de projeto e download DXF
- ✅ Error Boundary para captura de erros React
- ✅ Lock de concorrência na geração de projetos (409 Conflict)
- ✅ Graceful shutdown (SIGTERM/SIGINT → fecha HTTP + pool DB)
- ✅ CORS configurável via variável de ambiente

### O que falta:
- 🔜 Módulo 10: Frontend avançado (mapa satélite, perfil altimétrico, camadas de barreiras)
- 🔜 Módulo 11: Visão computacional com IA (futuro)
- 🔜 Sistema multi-distribuidora (Energisa, CEMIG, etc.)

---

## 4. FONTES DE DADOS GEOESPACIAIS

| Fonte | Dados | API | Custo |
|-------|-------|-----|-------|
| OpenStreetMap (Overpass) | Ruas, edificações, rios, ferrovias, vegetação | REST | Gratuito |
| SRTM (NASA) | Elevação 30m resolução | Arquivo local/API | Gratuito |
| MapBiomas | Uso do solo 10-30m (mata, pasto, água, urbano) | GeoTIFF/API | Gratuito |
| BDGD (ANEEL) | Rede elétrica existente | Download | Gratuito |
| Esri World Imagery | Imagem satélite para mapa base | Tiles | Gratuito |
| Google Maps API | Geocodificação, rotas (opcional) | REST | Pago (env var) |
| IBGE | Dados geográficos municipais | REST | Gratuito |

---

## 5. PIPELINE DE 10 ETAPAS

```
Etapa 1: COLETA DE DADOS OSM
  osmService → ruas, edificações, rios, ferrovias, vegetação
  (graceful degradation se Overpass falhar)

Etapa 2: DADOS DE ELEVAÇÃO
  elevacaoService → perfil altimétrico SRTM

Etapa 3: CLASSIFICAÇÃO DE TERRENO
  terrenoService → classificação MapBiomas (mata, pasto, urbano, água)

Etapa 4: DADOS COMPLEMENTARES
  googleMapsService → geocodificação (opcional, requer API key)
  ibgeService → dados municipais IBGE/ANEEL

Etapa 5: ANÁLISE DE TERRENO
  Grid de custos baseado no terreno:
    - Rua pavimentada = custo 1 (preferencial)
    - Pasto/campo = custo 3
    - Mata rala = custo 8
    - Mata densa = custo 50 (evitar)
    - Água/alagado = custo 100 (barreira)
    - APP = custo infinito (proibido)

Etapa 6: ROTEAMENTO
  roteamentoService → A* pathfinding no grid de custos
  roteamentoInteligenteService → detecção de esquinas e otimização
  Segue ruas preferencialmente, contorna barreiras automaticamente

Etapa 7: POSICIONAMENTO DE POSTES
  posicionamentoService → distribui postes ao longo da rota
  Respeita vãos máximos por tipo de rede e área
  Posiciona postes especiais em curvas, travessias, derivações

Etapa 8: DETECÇÃO DE BARREIRAS
  barreirasService → identifica cruzamentos com: rios, ferrovias, rodovias, áreas verdes
  Marca trechos que precisam de tratamento especial
  Define altura mínima por tipo de travessia

Etapa 9: APLICAÇÃO DE REGRAS NT EQUATORIAL
  regrasNDUService → classifica zona de corrosão (C2/C3/C4/C5)
  Verifica zonas especiais do Maranhão (polígonos NT.00008)
  materiaisService → seleciona materiais por zona
  Valida vãos, alturas, afastamentos

Etapa 10: GERAÇÃO DE SAÍDA
  dxfService → DXF com layers padronizados Equatorial
  materiaisService → lista de materiais com códigos SAP
  Relatório de barreiras e recomendações
```

---

## 6. REGRAS TÉCNICAS — RESUMO NT EQUATORIAL

### 6.1 Tensões nominais

| Nível | Classes | Tensões primárias |
|-------|---------|-------------------|
| MT | 15kV, 24.2kV, 36.2kV | 13.8kV, 23.1kV, 34.5kV |
| BT | — | 380/220V, 220/127V |

### 6.2 Vãos máximos (metros)

| Tipo de Rede | Área Urbana | Área Rural |
|--------------|-------------|------------|
| MT (13.8kV) Compacta | 40m | 80m |
| MT (13.8kV) Convencional | 80m | 150m |
| BT (380/220V) Multiplexada | 35m | 40m |
| BT (380/220V) Nua | 30m | 35m |

### 6.3 Alturas mínimas de condutores

| Situação | MT | BT |
|----------|----|----|
| Solo normal | 6.0m | 5.5m |
| Travessia de rodovia | 7.0m | 6.0m |
| Travessia de ferrovia | 9.0m | 8.0m |
| Travessia de rio navegável | 12.0m | 10.0m |

### 6.4 Postes padrão

| Tipo | Altura | Esforços disponíveis | Uso típico |
|------|--------|---------------------|------------|
| DT (Duplo T) | 9m, 10m, 11m, 12m | 150, 300, 600 daN | Urbano, BT |
| Circular | 10m, 11m, 12m, 13m | 300, 600, 1000, 1500, 2000 daN | MT, Rural |
| Metálico | 12m+ | Variável | Travessias especiais |

### 6.5 Zonas de corrosão (NT.00008 — ISO 9223)

| Zona | Classificação | Distância da orla | DEEU (kV) | Material obrigatório |
|------|---------------|-------------------|-----------|---------------------|
| C2 | Baixa | ≥ 10 km | 27.8 | Aço galvanizado padrão |
| C3 | Média | 5–10 km | 34.7 | Aço galvanizado reforçado ou concreto |
| C4 | Alta (litoral) | 2–5 km | 43.3 | Concreto armado ou fibra de vidro |
| C5 | Muito alta | < 2 km | 53.7 | Fibra de vidro ou concreto microssílica |

**Zonas especiais do Maranhão:** Ilha de São Luís até Estreito e Barreirinhas possuem classificação pré-definida (C4 interno / C5 na orla), independente da regra geral de distância.

### 6.6 Condutores por zona de corrosão

**Rede MT:**
| Condutor | C2 | C3 | C4 | C5 | Observação |
|----------|:--:|:--:|:--:|:--:|------------|
| CA (Alumínio Simples) | ✅ | ✅ | ❌ | ❌ | — |
| CAA (Alumínio + Alma Aço) | ✅ | ✅ | ❌ | ❌ | — |
| CAL 6201 (Liga Alumínio) | ❌ | ❌ | ✅ | ✅ | Obrigatório em faixa litorânea |
| Protegido XLPE (Compacta) | ✅ | ✅ | ❌ | ❌ | Rede compacta |
| Cobre Nu | ❌ | ❌ | ❌ | ❌ | Apenas EMUC de terceiros |

**Rede BT:**
| Condutor | C2 | C3 | C4 | C5 |
|----------|:--:|:--:|:--:|:--:|
| Multiplexado Neutro Nu | ✅ | ✅ | ✅ | ❌ |
| Multiplexado Neutro Isolado | ❌ | ❌ | ❌ | ✅ |

**Ramal de Ligação BT:**
| Condutor | C2 | C3 | C4 | C5 |
|----------|:--:|:--:|:--:|:--:|
| Concêntrico | ✅ | ✅ | ✅ | ❌ |
| Multiplexado Neutro Nu | ✅ | ✅ | ✅ | ❌ |
| Multiplexado Neutro Isolado | ❌ | ❌ | ❌ | ✅ |

### 6.7 Materiais por zona de corrosão (resumo)

| Componente | C2/C3 | C4/C5 |
|------------|-------|-------|
| Pré-formados | Aço carbono zincado Classe B | Liga de alumínio 6061/6201 |
| Ferragens | Galvanizada/Zincada | Liga de alumínio |
| Chave fusível | Porcelana ou polimérica | Polimérica com espaçador |
| Para-raios terminais | Padrão | Aço inox 316 |
| Cruzetas | Fibra de vidro | Fibra de vidro |
| Postes (C5) | Concreto CAA II | Fibra de vidro ou concreto microssílica |

**Áreas especiais:**
- Áreas de cana-de-açúcar: Isolador disco de vidro + poste e cruzeta de fibra de vidro
- Áreas alagadas por água salina: Poste obrigatório de fibra de vidro

### 6.8 Isoladores por zona

| Isolador | C2/C3 | C4/C5 |
|----------|-------|-------|
| Ancoragem polimérico | ✅ Todas as classes | ✅ Todas as classes (DEEU adequada) |
| Pino polimérico (RDC) | ✅ Todas as classes | ❌ Vedado |
| Pilar porcelana 15kV | ✅ | ❌ |
| Pilar porcelana 24.2/36.2kV | ✅ | ✅ com classe superior |
| Pilar híbrido | ❌ | ✅ Todas as classes |

---

## 7. PADRÕES DXF EQUATORIAL

### Layers obrigatórios:
```
POSTE           - Postes (círculos com código)
REDE_MT         - Rede média tensão (linhas vermelhas)
REDE_BT         - Rede baixa tensão (linhas azuis)
ESTRUTURA       - Cruzetas, isoladores
EQUIPAMENTO     - Transformadores, chaves
ATERRAMENTO     - Hastes e cabos de terra
TEXTO           - Anotações e códigos
COTA            - Cotas e medidas
LIMITE          - Limites de propriedade
```

### Nomenclatura de postes:
```
Formato: [TIPO]-[ALTURA]-[ESFORÇO]-[NÚMERO]
Exemplo: DT-11-300-001 (Duplo T, 11m, 300daN, poste #1)
Exemplo: CE-12-600-015 (Circular Especial, 12m, 600daN, poste #15)
```

---

## 8. DECISÕES TÉCNICAS JÁ TOMADAS

1. **Roteamento segue ruas** — não traça linha reta entre origem/destino
2. **Grid de custos** — terreno influencia o caminho (mata custa mais que pasto)
3. **Sem visita de campo** — tudo baseado em dados geoespaciais
4. **DXF como saída principal** — projetista abre no AutoCAD para revisão final
5. **Equatorial primeiro** — depois expandir para outras distribuidoras
6. **Frontend React + Vite** — Leaflet para mapa, com ErrorBoundary
7. **Pool PostgreSQL centralizado** — db.ts exporta pool único
8. **Funções geo centralizadas** — utils/geo.ts com haversine, bearing, etc.
9. **Seleção de materiais por zona de corrosão** — NT.00008 com classificação automática C2/C3/C4/C5
10. **WebSocket para progresso** — wsManager.ts com heartbeat ping/pong 30s
11. **Lock de concorrência** — evita geração duplicada na mesma OS (409 Conflict)
12. **Google Maps opcional** — funciona sem API key (graceful degradation)
13. **CORS configurável** — via variável de ambiente CORS_ORIGINS
14. **Graceful shutdown** — fecha HTTP + pool DB em SIGTERM/SIGINT

---

## 9. VARIÁVEIS DE AMBIENTE

| Variável | Default | Descrição |
|----------|---------|-----------|
| `DATABASE_URL` | `postgresql://...` | Conexão PostgreSQL |
| `PORT` | `3001` | Porta do backend |
| `GOOGLE_MAPS_API_KEY` | `''` (desabilitado) | API key Google Maps (opcional) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Origens permitidas CORS |
| `NODE_ENV` | `development` | Ambiente (sanitiza erros em production) |
| `REACT_APP_API_URL` | `http://localhost:3001/api` | URL da API no frontend |

---

## 10. PADRÕES DE CÓDIGO

```typescript
// Imports: sempre com extensão .js para ESM
import { pool } from '../db.js';
import { calcularDistancia, calcularBearing } from '../utils/geo.js';

// Interfaces: sempre tipadas, sem any
interface Poste {
  id: number;
  latitude: number;
  longitude: number;
  tipo: 'DT' | 'CE' | 'MET';
  altura: number;
  esforco: number;
}

// Services: funções puras quando possível
export async function posicionarPostes(rota: Coordenada[], config: ConfigRede): Promise<Poste[]> {
  // ...
}

// Erros: sempre com contexto
throw new Error(`Vão ${vao}m excede máximo ${vaoMax}m entre postes ${i} e ${i+1}`);

// Guards obrigatórios: sempre validar antes de operar
if (postes.length <= 1) return 0; // evita divisão por zero
if (distDir < 1e-10) continue;    // evita NaN em cálculos
if (!data.elements) return vazio;  // null guard para APIs externas
```

---

## 11. COMUNICAÇÃO FRONTEND ↔ BACKEND

### API REST

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/os` | Listar ordens de serviço |
| POST | `/api/os` | Criar OS (com validação de coordenadas) |
| GET | `/api/os/:id` | Detalhes da OS |
| PUT | `/api/os/:id` | Atualizar OS |
| DELETE | `/api/os/:id` | Deletar OS (transação cascata: condutor→poste→OS) |
| POST | `/api/geracao/:id` | Gerar projeto (com lock concorrência — 409 se duplicado) |
| GET | `/api/geracao/:id/dxf` | Download DXF do projeto |

### WebSocket

- **URL:** `ws://${hostname}:3001/ws`
- **Propósito:** Monitoramento de progresso da geração em tempo real
- **Heartbeat:** ping/pong a cada 30s, termina conexões mortas

### Response shape

O backend retorna dados flat. O frontend usa `data?.data || data` para compatibilidade.

---

## 12. CONFIGURAÇÃO MULTI-DISTRIBUIDORA (FUTURO)

```typescript
interface ConfigDistribuidora {
  nome: string;                    // 'equatorial' | 'energisa' | 'cemig'
  sigla: string;                   // 'EQTL' | 'NDU' | 'CEMIG'
  normas: string[];                // ['NT.00005', 'NT.00008', ...]
  normaCorrosao: string;           // 'NT.00008' | 'NDU-027'
  sistemaClassificacao: 'C2_C3_C4_C5' | 'P1_P2';
  tensoesMT: string[];             // ['15kV', '24.2kV', '36.2kV']
  tensoesBT: string[];             // ['380/220V', '220/127V']
  vaosMaximos: TabelaVaos;
  alturasMinimas: TabelaAlturas;
  estruturasPadrao: Estrutura[];
  condutoresPadrao: Condutor[];
  zonasCorrosao?: ZonaCorrosao[];  // Equatorial usa, Energisa não
  layersDXF: LayerConfig[];
  nomenclaturaPostes: NomenclaturaConfig;
}

// Mapeamento aproximado entre distribuidoras:
// Energisa Normal ≈ Equatorial C2 (Baixa)
// Energisa P1     ≈ Equatorial C3/C4 (Média/Alta)
// Energisa P2     ≈ Equatorial C5 (Muito Alta)
```

O sistema já está preparado para receber essa abstração — os services recebem `config` como parâmetro e não têm regras hardcoded.

---

## 13. CRITÉRIOS DE POSTEAÇÃO (NT.00005)

Regras adicionais para posicionamento de postes ao longo das ruas:

1. Caminhamento o mais próximo possível das concentrações de carga
2. Caminhamento deve seguir o sentido de crescimento da localidade
3. Ruas escolhidas devem estar topograficamente definidas e aprovadas pela Prefeitura
4. Arborização bilateral: postes do lado com menos arborização
5. Consumidores majoritários de um mesmo lado: posteação deste lado
6. Rua eixo Norte-Sul: posteação do lado Oeste (árvores no Leste para sombra à tarde)
7. Rua eixo Leste-Oeste: posteação do lado Norte (árvores no Sul para sombra na calçada)
