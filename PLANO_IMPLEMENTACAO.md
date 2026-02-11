# PLANO DE IMPLEMENTAÇÃO — Motor de Geração Automática de Projetos Elétricos

**Regra:** Cada módulo deve funcionar e compilar isoladamente antes de seguir ao próximo.

---

## STATUS DOS MÓDULOS

```
=== FASE 1: BACKEND (Motor de geração) — ✅ COMPLETO ===
1. elevacaoService.ts             ✅ Consulta SRTM, perfil altimétrico
2. terrenoService.ts              ✅ Grid de custos, classificação terreno
3. barreirasService.ts            ✅ Detecção de travessias e barreiras
4. regrasEquatorialService.ts     ✅ Motor de regras NT EQTL
5. roteamentoService.ts           ✅ A* com grid de custos integrado
6. materiaisService.ts            ✅ Lista de materiais (BOM)
7. dxfService.ts                  ✅ Geração DXF padrão Equatorial
8. geracaoService.ts              ✅ Orquestrador (pipeline 7 etapas)
9. Rotas, types, utils            ✅ geracaoRoutes, types/index, utils/geo, db

=== FASE 1.5: FRONTEND (Visualização) — 🔨 PRÓXIMO ===
10. Frontend — Mapa satélite + barreiras + perfil + painel resumo

=== FASE 2: IA VISUAL (Futuro) ===
11. Visão computacional em imagens de satélite
```

---

## MÓDULO 10: Frontend — Mapa Satélite + Visualização Completa
**Prioridade:** ALTA (próximo passo)
**Dependências frontend:** leaflet, react-leaflet, recharts

### 10.1 — Mapa base com satélite

Trocar tile padrão OpenStreetMap por imagem de satélite (Esri World Imagery, gratuito):

```typescript
// URL do tile de satélite (Esri — gratuito, sem API key):
const SATELLITE_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}';

// Alternativa Mapbox (melhor qualidade, requer token):
// 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=TOKEN'
```

Componentes:
- `MapaSatelite.tsx` — mapa base com toggle satélite/mapa/híbrido
- `ControleLayers.tsx` — checkbox para ligar/desligar cada camada

### 10.2 — Camada de postes

Marcadores circulares coloridos por tipo/função:
```
🟢 Verde = tangente (normal)
🟡 Amarelo = ângulo (deflexão)
🔴 Vermelho = fim de linha / ancoragem
🔵 Azul = derivação
🟣 Roxo = equipamento (trafo, chave, religador)
```

Popup ao clicar no poste:
```
POSTE P-007
Tipo: DT 11/600
Estrutura: N3
Função: DERIVAÇÃO
Altura: 11m | Resistência: 600 daN
Engastamento: 1.7m
Equipamentos: Chave fusível 100A
Coordenada: -2.5134, -44.2821
```

### 10.3 — Camada de condutores

Linhas coloridas entre postes:
```
— Vermelho (3px) = MT projetada
— Azul (2px) = BT projetada
-- Cinza tracejado = MT existente
```

Label no hover mostrando: `"45m ABC 3 #1/0 AWG CAA"`

### 10.4 — Camada de barreiras

Ícones específicos por tipo de barreira:
```
🌊 Azul escuro = travessia hídrica
🚂 Preto = travessia ferroviária
⚡ Amarelo = travessia de LT
🌳 Verde = trecho com poda/faixa
💧 Azul claro = área alagável
```

Popup com detalhes da barreira e impacto no projeto.

### 10.5 — Perfil altimétrico

Gráfico recharts mostrando:
- Eixo X: distância acumulada (metros)
- Eixo Y: elevação (metros)
- Linha do perfil do terreno
- Marcadores de postes sobre a linha
- Áreas destacadas: alagáveis (azul), floresta (verde)
- Declive máximo destacado em vermelho

```typescript
// Dados vindos do backend:
interface PerfilAltimetrico {
  pontos: { lat: number; lng: number; elevacao: number }[];
  elevacaoMinima: number;
  elevacaoMaxima: number;
  desnivelTotal: number;
  decliveMaximo: number;
}
```

### 10.6 — Painel de resumo do projeto

Sidebar ou card com resumo visual:
```
📊 RESUMO DO PROJETO
─────────────────────
Extensão total MT:    4.127m
Extensão total BT:      806m
Postes projetados:       90
Transformadores:          5
Chaves fusíveis:          3

⚠️ BARREIRAS
Travessias hídricas:      2
Trechos com poda:         1
Áreas alagáveis:          0

📦 MATERIAIS
Total itens:            347
[📥 Baixar lista]

📐 PROJETO
[📥 Baixar DXF]
[📥 Relatório PDF]
```

### 10.7 — Componentes React a criar/atualizar

```
frontend/src/
├── components/
│   ├── MapaSatelite.tsx           # NOVO - mapa base com layers toggle
│   ├── CamadaPostes.tsx           # NOVO - marcadores de postes coloridos
│   ├── CamadaCondutores.tsx       # NOVO - linhas MT/BT com estilo
│   ├── CamadaBarreiras.tsx        # NOVO - ícones de barreiras
│   ├── CamadaTerreno.tsx          # NOVO - overlay de classificação
│   ├── CamadaFaixaServidao.tsx    # NOVO - polígono de faixa
│   ├── PerfilAltimetrico.tsx      # NOVO - gráfico recharts
│   ├── PainelResumo.tsx           # NOVO - sidebar com estatísticas
│   ├── PopupPoste.tsx             # NOVO - detalhes do poste
│   ├── PopupBarreira.tsx          # NOVO - detalhes da barreira
│   └── ControleLayers.tsx         # NOVO - toggle de camadas
├── pages/
│   ├── GerarProjetoPage.tsx       # ATUALIZAR - integrar novos componentes
│   └── OSDetailPage.tsx           # ATUALIZAR - mostrar resumo
└── services/
    └── projetoService.ts          # ATUALIZAR - chamar novos endpoints
```

### 10.8 — Novos services frontend

```typescript
// projetoService.ts - adicionar:
async function getBarreiras(osId: number): Promise<RelatorioBarreiras> { ... }
async function getMateriais(osId: number): Promise<ListaMateriais> { ... }
async function getPerfilAltimetrico(osId: number): Promise<PerfilAltimetrico> { ... }
async function downloadDXF(osId: number): Promise<Blob> { ... }
```

### 10.9 — Endpoints do backend (já existem no geracaoRoutes.ts)

```
POST   /api/os/:id/gerar-projeto     → gera o projeto completo
GET    /api/os/:id/postes             → retorna postes do cache
GET    /api/os/:id/condutores         → retorna condutores do cache
GET    /api/os/:id/barreiras          → retorna relatório de barreiras
GET    /api/os/:id/materiais          → retorna lista de materiais
GET    /api/os/:id/perfil             → retorna perfil altimétrico
GET    /api/os/:id/dxf                → retorna arquivo DXF
POST   /api/os/:id/salvar-projeto     → salva postes/condutores no banco
```

### 10.10 — Bug a corrigir no frontend

A interface `CondutorGerado` no frontend usa `comprimento` mas o backend retorna `comprimento_metros`. Alinhar os nomes.

### 10.11 — Melhoria: interceptor de erros no axios

```typescript
// frontend/src/services/api.ts
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response?.data);
    return Promise.reject(error);
  }
);
```

---

## MÓDULO 11: Visão Computacional em Imagens de Satélite (FUTURO)
**Arquivos:** `src/services/visaoService.ts` (backend)
**Dependências:** API de visão (Claude Vision, Google Vision, ou modelo custom)
**Prioridade:** BAIXA (fase 2, após sistema em produção)

### 11.1 — Problema que resolve

O OSM classifica uma área como "pastagem", mas na realidade:
- Tem 3 mangueiras enormes no meio que vão interferir na rede
- Tem uma casa nova que foi construída há 2 meses
- Tem um córrego seco que só aparece na imagem
- Tem uma estrada de terra que não está mapeada
- Tem uma cerca que muda de posição
- Tem uma torre de celular ou silo que pode conflitar

MapBiomas tem resolução de 10m — não detecta árvores isoladas nem construções pequenas.

### 11.2 — Como funcionaria

```
ETAPA 1: Obter imagem satélite de alta resolução (~0.5m/pixel)
  Fonte: Google Static Maps API (satélite) ou Mapbox Satellite
  Custo: ~$0.007 por imagem 640x640px
  Cobertura: faixa de 50m ao longo da rota inteira

ETAPA 2: Segmentar imagem com IA
  Opção A: Claude Vision API
    - Enviar imagem + prompt: "Identifique nesta imagem de satélite:
      árvores grandes, edificações, corpos d'água, estradas não mapeadas,
      cercas, torres, obstáculos para linha elétrica"
    - Retorna: lista de objetos com coordenadas aproximadas

  Opção B: Modelo especializado (Segment Anything / YOLO)
    - Treinar com exemplos de imagens da região
    - Mais preciso, mas requer GPU e dados de treinamento

  Opção C: Google Earth Engine + Machine Learning
    - Séries temporais (detectar mudanças recentes)
    - Classificação supervisionada com amostras locais

ETAPA 3: Cruzar detecções com dados vetoriais
  - Árvore detectada na imagem + OSM diz "pastagem" → CONFLITO → marcar
  - Edificação detectada + OSM não tem building → CONFLITO → ajustar rota
  - Estrada detectada + OSM não tem highway → OPORTUNIDADE → roteamento

ETAPA 4: Gerar camada de validação
  - Overlay no mapa frontend mostrando detecções da IA
  - Classificar confiança: alta/média/baixa
  - Projetista valida ou descarta cada detecção
```

### 11.3 — Interface proposta

```typescript
interface DeteccaoVisual {
  id: string;
  tipo: 'ARVORE' | 'EDIFICACAO' | 'AGUA' | 'ESTRADA' | 'CERCA' | 'TORRE' | 'OUTRO';
  coordenada: Coordenada;
  confianca: number;          // 0.0 a 1.0
  raio_estimado: number;      // metros (tamanho aproximado)
  descricao: string;
  conflito_com_osm: boolean;
  impacto_projeto: 'NENHUM' | 'AJUSTE_ROTA' | 'PODA' | 'BARREIRA' | 'REVISAO_MANUAL';
  validado?: boolean;
}

interface AnaliseVisual {
  imagens_processadas: number;
  deteccoes: DeteccaoVisual[];
  conflitos_osm: number;
  confianca_media: number;
  recomendacao: string;
}
```

### 11.4 — Custo estimado

```
Google Static Maps (satélite): ~$0.007/imagem
Claude Vision API: ~$0.01/imagem (input image)
Total por projeto (rota de 5km): ~20 imagens × $0.017 = ~$0.35/projeto

Alternativa sem custo:
- Sentinel-2 (10m resolução) via API gratuita
- Menos preciso, não detecta árvores individuais
- Útil para validar MapBiomas e detectar mudanças recentes
```

### 11.5 — Roadmap

```
Fase 2a: Claude Vision (mais rápido de implementar)
Fase 2b: Modelo próprio (mais preciso, mais trabalho)
Fase 2c: Feedback loop (melhoria contínua com validação do projetista)
```

---

## DEPENDÊNCIAS A INSTALAR

```bash
# Módulo 10 (Frontend mapa):
cd frontend && npm install react-leaflet leaflet @types/leaflet

# Módulo 10 (Frontend gráficos):
cd frontend && npm install recharts

# Opcionais futuros:
# npm install geotiff @types/geotiff    # MapBiomas GeoTIFF
# npm install @turf/turf                # Operações geoespaciais avançadas
```

---

## COMO USAR NO CLAUDE CODE

```bash
# Para o módulo 10 (frontend):
@CONTEXTO_PROJETO.md @PLANO_IMPLEMENTACAO.md
Implemente o módulo 10 (frontend). Comece pelo MapaSatelite.tsx usando
tiles Esri World Imagery (gratuito) e o ControleLayers.tsx para toggle de camadas.
Depois CamadaPostes.tsx com marcadores coloridos por função.
```
