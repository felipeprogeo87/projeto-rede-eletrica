# PADRÕES DE DESENVOLVIMENTO — Motor de Geração Automática de Projetos Elétricos

**Autor:** Felipe Fernandes  
**Repositório:** GitHub  
**Última atualização:** Fevereiro/2026

---

## 1. ESTRUTURA DE BRANCHES (Git Flow Simplificado)

```
main                    ← Produção estável (só recebe merges de release)
├── develop             ← Branch de integração (trabalho diário)
│   ├── feature/xxx     ← Novas funcionalidades
│   ├── fix/xxx         ← Correções de bugs
│   └── refactor/xxx    ← Refatorações sem mudança funcional
├── release/x.x.x       ← Preparação para release (testes finais)
└── hotfix/xxx          ← Correções urgentes em produção
```

### Regras de branches:

| Branch | Criada a partir de | Merge para | Quando usar |
|--------|-------------------|------------|-------------|
| `feature/xxx` | `develop` | `develop` | Nova funcionalidade ou módulo |
| `fix/xxx` | `develop` | `develop` | Correção de bug não urgente |
| `refactor/xxx` | `develop` | `develop` | Limpeza de código, tipagem, organização |
| `release/x.x.x` | `develop` | `main` + `develop` | Preparar versão para produção |
| `hotfix/xxx` | `main` | `main` + `develop` | Correção urgente em produção |

### Nomenclatura de branches:

```bash
# Features (módulos novos)
feature/modulo-10-mapa-satelite
feature/camada-postes
feature/perfil-altimetrico
feature/multi-distribuidora

# Fixes (correções)
fix/vao-maximo-mt-compacta
fix/zona-corrosao-maranhao
fix/dxf-layer-aterramento

# Refatorações
refactor/tipagem-services
refactor/regras-ndu-para-eqtl
refactor/separar-materiais-por-zona
```

### Fluxo de trabalho:

```bash
# 1. Criar branch a partir de develop
git checkout develop
git pull origin develop
git checkout -b feature/modulo-10-mapa-satelite

# 2. Trabalhar e commitar (ver padrão de commits abaixo)
git add .
git commit -m "feat(frontend): adicionar MapaSatelite com tiles Esri"

# 3. Push para remoto
git push origin feature/modulo-10-mapa-satelite

# 4. Criar Pull Request no GitHub: feature → develop
# 5. Após aprovação, merge e deletar branch
```

---

## 2. PADRÃO DE COMMITS (Conventional Commits)

### Formato:

```
<tipo>(<escopo>): <descrição curta>

[corpo opcional - o que mudou e por quê]

[rodapé opcional - breaking changes, issues]
```

### Tipos permitidos:

| Tipo | Quando usar | Exemplo |
|------|-------------|---------|
| `feat` | Nova funcionalidade | `feat(materiais): adicionar seleção por cana-de-açúcar` |
| `fix` | Correção de bug | `fix(roteamento): corrigir A* ignorando barreiras de APP` |
| `refactor` | Refatoração sem mudar comportamento | `refactor(regras): renomear NDU para EQTL` |
| `docs` | Documentação | `docs: atualizar CONTEXTO_PROJETO com zonas corrosão` |
| `style` | Formatação, lint (sem mudança lógica) | `style(services): aplicar prettier em todos os services` |
| `test` | Testes | `test(materiais): testar seleção CAL em zona C4` |
| `chore` | Configs, dependências, build | `chore: atualizar dependências frontend` |
| `perf` | Performance | `perf(roteamento): otimizar grid A* para rotas > 10km` |

### Escopos do projeto:

| Escopo | Área |
|--------|------|
| `frontend` | Componentes React, páginas, mapa |
| `backend` | Server, rotas, configurações |
| `roteamento` | roteamentoService.ts |
| `materiais` | materiaisService.ts |
| `regras` | regrasNDUService.ts |
| `barreiras` | barreirasService.ts |
| `elevacao` | elevacaoService.ts |
| `terreno` | terrenoService.ts |
| `dxf` | dxfService.ts |
| `geracao` | geracaoService.ts (orquestrador) |
| `osm` | osmService.ts |
| `db` | Banco de dados, migrations |
| `geo` | utils/geo.ts |
| `docker` | Docker, docker-compose |

### Exemplos reais para o projeto:

```bash
# Features
git commit -m "feat(frontend): implementar MapaSatelite com toggle Esri/OSM"
git commit -m "feat(materiais): adicionar códigos SAP para chaves fusíveis C4/C5"
git commit -m "feat(regras): implementar zonas especiais do Maranhão"
git commit -m "feat(dxf): adicionar layer ATERRAMENTO com hastes de terra"
git commit -m "feat(geracao): incluir zona de corrosão no relatório de saída"

# Fixes
git commit -m "fix(regras): CAL 6201 deve ser obrigatório em C4, não opcional"
git commit -m "fix(roteamento): vão máximo MT compacta urbana é 40m, não 80m"
git commit -m "fix(materiais): multiplexado neutro isolado obrigatório em C5"
git commit -m "fix(dxf): nomenclatura poste seguir formato TIPO-ALTURA-ESFORÇO-NUM"

# Refatorações
git commit -m "refactor(regras): separar regras por distribuidora (EQTL vs NDU)"
git commit -m "refactor(backend): eliminar tipos any em interfaces de poste"
git commit -m "refactor(geo): extrair cálculo de distância da orla para função própria"

# Docs
git commit -m "docs: adicionar CHANGELOG.md com histórico de versões"
git commit -m "docs: atualizar REGRAS_NT00008 com isoladores por classe de tensão"

# Chores
git commit -m "chore: adicionar react-leaflet e recharts ao frontend"
git commit -m "chore(docker): atualizar PostgreSQL para 16"
```

---

## 3. CHANGELOG (Registro de Alterações)

Manter arquivo `CHANGELOG.md` na raiz do projeto, atualizado a cada release.

### Formato:

```markdown
# Changelog

Todas as alterações notáveis do projeto serão documentadas neste arquivo.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Unreleased]

### Adicionado
- (lista do que está sendo desenvolvido na branch develop)

---

## [1.0.0] - 2026-02-11

### Adicionado
- Módulo 1: Elevação SRTM (elevacaoService.ts)
- Módulo 2: Classificação de terreno MapBiomas (terrenoService.ts)
- Módulo 3: Detecção de barreiras - rios, ferrovias, florestas, alagados (barreirasService.ts)
- Módulo 4: Regras NT Equatorial - vãos, alturas, postes, condutores (regrasNDUService.ts)
- Módulo 5: Roteamento A* com grid de custos por terreno (roteamentoService.ts)
- Módulo 6: Lista de materiais com seleção por zona de corrosão C2/C3/C4/C5 (materiaisService.ts)
- Módulo 7: Geração de DXF com layers padrão Equatorial (dxfService.ts)
- Módulo 8: Orquestrador que encadeia pipeline completo (geracaoService.ts)
- Módulo 9: Rotas API e tipagens TypeScript
- CRUD de Ordens de Serviço com formulário 3 etapas
- Seleção de origem/destino no mapa (Leaflet)
- Consulta OSM via Overpass API
- Classificação automática de zona de corrosão por distância da orla
- Zonas especiais do Maranhão (polígonos NT.00008)
- Seleção de materiais por zona: condutores, isoladores, ferragens, postes
- Pool PostgreSQL centralizado (db.ts)
- Funções geoespaciais reutilizáveis (utils/geo.ts)

### Normas implementadas
- NT.00005.EQTL Rev.05 - Critérios de Projetos de Redes de Distribuição
- NT.00006.EQTL Rev.04 - Padrão de Estruturas 13,8kV e BT
- NT.00007.EQTL Rev.06 - Padrão de Estruturas para Equipamentos
- NT.00008.EQTL Rev.03 - Padronização de Materiais por Tipo de Ambiente
- NT.00022.EQTL Rev.04 - Padrão de Estruturas 23,1kV e 34,5kV
```

### Categorias do changelog:

| Categoria | Quando usar |
|-----------|-------------|
| `Adicionado` | Funcionalidades novas |
| `Alterado` | Mudanças em funcionalidades existentes |
| `Corrigido` | Correções de bugs |
| `Removido` | Funcionalidades removidas |
| `Segurança` | Correções de vulnerabilidades |
| `Normas implementadas` | Regras técnicas novas (específico deste projeto) |

---

## 4. KANBAN / BOARD DE TAREFAS (GitHub Projects)

### Configuração do board:

Criar um **GitHub Project** (Projects v2) com as seguintes colunas:

| Coluna | Descrição |
|--------|-----------|
| 📋 **Backlog** | Tarefas identificadas, ainda não priorizadas |
| 🎯 **To Do** | Priorizadas para o sprint atual |
| 🔧 **In Progress** | Em desenvolvimento ativo |
| 👀 **Review** | Aguardando revisão / teste |
| ✅ **Done** | Concluído e mergeado |

### Labels para Issues:

| Label | Cor | Uso |
|-------|-----|-----|
| `módulo-10` | 🔵 azul | Frontend avançado |
| `módulo-11` | 🟣 roxo | Visão computacional |
| `backend` | 🟢 verde | Melhorias backend |
| `norma-técnica` | 🟠 laranja | Regras NT Equatorial |
| `bug` | 🔴 vermelho | Defeito |
| `melhoria` | 🟡 amarelo | Aprimoramento |
| `documentação` | ⚪ cinza | Docs |
| `urgente` | 🔴 vermelho escuro | Prioridade máxima |

### Issues iniciais sugeridas:

```markdown
## Módulo 10 — Frontend Avançado

- [ ] #1  [feature] MapaSatelite.tsx com tiles Esri World Imagery
- [ ] #2  [feature] ControleLayers.tsx - toggle satélite/OSM/barreiras/postes
- [ ] #3  [feature] CamadaPostes.tsx - marcadores coloridos por função
- [ ] #4  [feature] CamadaBarreiras.tsx - ícones e polígonos de obstáculos
- [ ] #5  [feature] CamadaRede.tsx - linhas MT (vermelho) e BT (azul)
- [ ] #6  [feature] PerfilAltimetrico.tsx - gráfico Recharts com elevação
- [ ] #7  [feature] PainelResumo.tsx - card lateral com dados do projeto
- [ ] #8  [feature] PainelDownloads.tsx - botões DXF + materiais + relatório

## Melhorias Backend

- [ ] #9  [refactor] Eliminar tipos any em todas as interfaces
- [ ] #10 [refactor] Renomear regrasNDUService para regrasEQTLService
- [ ] #11 [fix] Validar todas as regras NT.00008 no materiaisService
- [ ] #12 [fix] Verificar vãos máximos por classe de tensão (23.1kV e 34.5kV)
- [ ] #13 [feat] Adicionar critérios de posteação NT.00005 (orientação rua, arborização)
- [ ] #14 [perf] Otimizar roteamento A* para rotas > 10km
- [ ] #15 [feat] Implementar áreas de cana-de-açúcar no materiaisService
- [ ] #16 [feat] Implementar áreas alagadas por água salina

## Documentação

- [ ] #17 [docs] Criar README.md do repositório
- [ ] #18 [docs] Documentar API endpoints (Swagger ou markdown)
```

---

## 5. VERSIONAMENTO (Semantic Versioning)

```
MAJOR.MINOR.PATCH

MAJOR = Mudança incompatível (ex: multi-distribuidora)
MINOR = Nova funcionalidade compatível (ex: novo módulo)
PATCH = Correção de bug
```

### Versões planejadas:

| Versão | Marco | Conteúdo |
|--------|-------|----------|
| `1.0.0` | FASE 1 ✅ | Backend completo — Módulos 1-9 |
| `1.1.0` | FASE 1.5 | Módulo 10 — Frontend avançado |
| `1.2.0` | | Melhorias backend — regras NT.00005 posteação |
| `1.3.0` | | Suporte a 23.1kV e 34.5kV completo |
| `2.0.0` | FASE 2 | Multi-distribuidora (Energisa, CEMIG) |
| `3.0.0` | FASE 3 | Módulo 11 — Visão computacional IA |

---

## 6. GITIGNORE

```gitignore
# Dependências
node_modules/
.npm/

# Build
dist/
build/

# Ambiente
.env
.env.local
.env.production

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Dados locais
*.hgt
*.tif
*.geotiff
data/srtm/
data/mapbiomas/

# Logs
*.log
npm-debug.log*

# Docker volumes
pgdata/

# Arquivos gerados
output/
*.dxf
```

---

## 7. INSTRUÇÕES PARA CLAUDE CODE

Ao usar Claude Code, iniciar sempre com contexto e escopo limitado:

```bash
# Template padrão para Claude Code:
@CONTEXTO_PROJETO.md
[Tarefa específica em 1-3 linhas]
Faça as alterações diretamente, sem listar problemas antes.
Commite com mensagem seguindo Conventional Commits.

# Exemplos:

# Feature nova
@CONTEXTO_PROJETO.md @PLANO_IMPLEMENTACAO.md
Implemente o CamadaPostes.tsx com marcadores coloridos por função do poste.
Use as cores definidas no PLANO_IMPLEMENTACAO (azul=normal, laranja=ancoragem, etc.)
Commite como: feat(frontend): implementar CamadaPostes com marcadores coloridos

# Correção
@REGRAS_NT00008_EQTL_COMPLETAS.md
No materiaisService.ts, corrija: condutor CAL 6201 deve ser obrigatório
em C4/C5, e CA/CAA vedados nessas zonas.
Commite como: fix(materiais): corrigir seleção condutores por zona corrosão

# Refatoração
@CONTEXTO_PROJETO.md
Refatore o regrasNDUService.ts: elimine todos os tipos any,
adicione interfaces tipadas para cada regra.
Commite como: refactor(regras): adicionar tipagem completa ao service
```

### Dica para evitar "Prompt too long":
- Referenciar apenas 1 arquivo de contexto por vez
- Focar em 1 service/componente por conversa
- Abrir nova conversa quando o contexto acumular
- Pedir correções diretas em vez de "liste os problemas"

---

## 8. SETUP INICIAL DO REPOSITÓRIO

Comandos para configurar tudo no GitHub:

```bash
# 1. Criar branch develop (se não existe)
git checkout -b develop
git push -u origin develop

# 2. Definir develop como branch padrão no GitHub
# GitHub → Settings → Branches → Default branch → develop

# 3. Proteger branch main
# GitHub → Settings → Branches → Branch protection rules
# - Require pull request before merging
# - Require status checks (futuro: CI)

# 4. Criar o primeiro tag de versão
git tag -a v1.0.0 -m "Fase 1 completa: Backend com módulos 1-9"
git push origin v1.0.0

# 5. Adicionar arquivos de padrão
# - CHANGELOG.md (na raiz)
# - .gitignore (atualizar)
# - Este arquivo (PADROES_DESENVOLVIMENTO.md) nos docs do projeto

# 6. Criar GitHub Project
# GitHub → Projects → New project → Board
# Adicionar colunas: Backlog, To Do, In Progress, Review, Done
# Criar issues conforme seção 4
```
