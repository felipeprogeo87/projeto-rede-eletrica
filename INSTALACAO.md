# 🚀 Atualização do Projeto - Demo com Geração Automática + OSM

## Arquivos Novos a Adicionar

### Frontend

1. **`src/pages/OSFormPageV2.tsx`** - Formulário completo com mapa
2. **`src/pages/GerarProjetoPage.tsx`** - Página de geração automática

### Backend

1. **`src/routes/geracaoRoutes.ts`** - Endpoints de geração
2. **`src/services/geracaoServiceV2.ts`** - Lógica de geração (renomear para geracaoService.ts)
3. **`src/services/osmService.ts`** - Integração com OpenStreetMap
4. **`src/services/roteamentoService.ts`** - Algoritmo A* para roteamento

---

## Passo 1: Copiar Arquivos

Copie os arquivos desta pasta para seu projeto:

```bash
# Frontend
cp frontend/src/pages/OSFormPageV2.tsx ~/projeto-rede-eletrica/frontend/src/pages/
cp frontend/src/pages/GerarProjetoPage.tsx ~/projeto-rede-eletrica/frontend/src/pages/

# Backend - Rotas
cp backend/src/routes/geracaoRoutes.ts ~/projeto-rede-eletrica/backend/src/routes/

# Backend - Serviços (OSM + Roteamento + Geração)
cp backend/src/services/osmService.ts ~/projeto-rede-eletrica/backend/src/services/
cp backend/src/services/roteamentoService.ts ~/projeto-rede-eletrica/backend/src/services/
cp backend/src/services/geracaoServiceV2.ts ~/projeto-rede-eletrica/backend/src/services/geracaoService.ts
```

### Instalar dependência do Backend

```bash
cd ~/projeto-rede-eletrica/backend
npm install axios
```

---

## Passo 2: Atualizar App.tsx (Frontend)

Abra `frontend/src/App.tsx` e adicione as importações e rotas:

```tsx
// Adicionar no topo (imports)
import OSFormPageV2 from './pages/OSFormPageV2';
import GerarProjetoPage from './pages/GerarProjetoPage';

// Adicionar nas rotas (dentro de <Routes>)
<Route path="/os/nova-v2" element={<OSFormPageV2 />} />
<Route path="/os/:id/gerar" element={<GerarProjetoPage />} />
```

**Opcional:** Para substituir o formulário antigo:
```tsx
// Trocar:
<Route path="/os/nova" element={<OSFormPage />} />
// Por:
<Route path="/os/nova" element={<OSFormPageV2 />} />
```

---

## Passo 3: Atualizar Backend (index.ts ou app.ts)

Adicione a rota de geração:

```typescript
// Adicionar import
import geracaoRoutes from './routes/geracaoRoutes';

// Adicionar rota (depois das outras rotas de OS)
app.use('/api', geracaoRoutes);
```

---

## Passo 4: Atualizar Banco de Dados (se necessário)

A tabela `ordem_servico` precisa dos novos campos. Execute no PostgreSQL:

```sql
-- Adicionar campos novos (se não existirem)
ALTER TABLE ordem_servico 
  ADD COLUMN IF NOT EXISTS cliente_cpf_cnpj VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_telefone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cliente_email VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cliente_endereco TEXT,
  ADD COLUMN IF NOT EXISTS tipo_projeto VARCHAR(50) DEFAULT 'extensao',
  ADD COLUMN IF NOT EXISTS distribuidora VARCHAR(10) DEFAULT 'EPB',
  ADD COLUMN IF NOT EXISTS tipo_rede VARCHAR(50) DEFAULT 'bt_multiplexada',
  ADD COLUMN IF NOT EXISTS tensao_mt VARCHAR(20) DEFAULT '13.8kV',
  ADD COLUMN IF NOT EXISTS carga_estimada_kva DECIMAL(10,2) DEFAULT 0;
```

---

## Passo 5: Testar

1. Inicie o backend: `cd backend && npm run dev`
2. Inicie o frontend: `cd frontend && npm start`
3. Acesse: `http://localhost:3000/os/nova-v2`

---

## Fluxo do Demo

1. **Formulário de OS** → Preenche dados + clica origem/destino no mapa
2. **Geração Automática** → Sistema processa:
   - Busca ruas do OpenStreetMap (Overpass API)
   - Identifica edificações e obstáculos
   - Calcula rota seguindo as ruas (algoritmo A*)
   - Posiciona postes respeitando vãos NDU
   - Valida projeto contra regras NDU
3. **Validação Visual** → Postes verdes = OK, amarelos = avisos
4. **Salvar** → Projeto salvo e pronto para edição manual

---

## 🗺️ Como funciona a Integração OSM

### Dados que o sistema busca automaticamente:

| Tipo | Tag OSM | Uso |
|------|---------|-----|
| Ruas | `highway=residential/tertiary/etc` | Traçado segue essas vias |
| Edificações | `building=*` | Manter distância mínima |
| Rios | `waterway=river/stream` | Obstáculo - evitar ou travessia especial |
| Ferrovias | `railway=rail` | Altura mínima 9m |
| Rodovias | `highway=trunk/motorway` | Altura mínima 7m |
| Áreas verdes | `landuse=forest`, `leisure=park` | Evitar quando possível |

### API utilizada:
- **Overpass API** (gratuita, sem autenticação)
- URLs de fallback para garantir disponibilidade
- Timeout de 30 segundos por requisição

---

## Cidades da Paraíba Disponíveis

O mapa centraliza automaticamente em:
- João Pessoa
- Campina Grande
- Santa Rita
- Patos
- Bayeux
- Sousa
- Cajazeiras
- Cabedelo
- Guarabira
- Mamanguape

---

## Próximos Passos (após demo funcionar)

1. Implementar busca real de dados do OpenStreetMap
2. Implementar algoritmo de traçado
3. Implementar motor de regras NDU completo
4. Adicionar mais validações
