import React, { useState, useMemo } from 'react';

interface Erro {
  id: string;
  tipo: 'ERRO' | 'AVISO' | 'INFO';
  categoria: string;
  mensagem: string;
  detalhe?: string;
  localizacao?: { lat: number; lng: number; posteId?: string };
  sugestao?: string;
  regra?: string;
}

interface ListaErrosProps {
  erros: Erro[];
  avisos: Erro[];
  infos?: Erro[];
  onLocalizarNoMapa?: (lat: number, lng: number) => void;
  nomeOS?: string;
}

const ListaErros: React.FC<ListaErrosProps> = ({ erros, avisos, infos = [], onLocalizarNoMapa, nomeOS = 'Projeto' }) => {
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'ERRO' | 'AVISO' | 'INFO'>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');
  const [busca, setBusca] = useState('');
  const [expandido, setExpandido] = useState<Set<string>>(new Set());

  const todosItens = useMemo(() => [
    ...erros.map(e => ({ ...e, tipo: 'ERRO' as const })),
    ...avisos.map(a => ({ ...a, tipo: 'AVISO' as const })),
    ...infos.map(i => ({ ...i, tipo: 'INFO' as const })),
  ], [erros, avisos, infos]);

  const categorias = useMemo(() => ['todas', ...Array.from(new Set(todosItens.map(i => i.categoria)))], [todosItens]);

  const itensFiltrados = useMemo(() => todosItens.filter(item => {
    if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false;
    if (filtroCategoria !== 'todas' && item.categoria !== filtroCategoria) return false;
    if (busca && !item.mensagem.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  }), [todosItens, filtroTipo, filtroCategoria, busca]);

  const toggleExpansao = (id: string) => {
    setExpandido(prev => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  };

  const exportarCSV = () => {
    const headers = ['Tipo', 'Categoria', 'Mensagem', 'Detalhe', 'Sugestão', 'Regra', 'Latitude', 'Longitude', 'Poste'];
    const rows = itensFiltrados.map(item => [
      item.tipo, item.categoria, `"${item.mensagem.replace(/"/g, '""')}"`,
      `"${(item.detalhe || '').replace(/"/g, '""')}"`, `"${(item.sugestao || '').replace(/"/g, '""')}"`,
      item.regra || '', item.localizacao?.lat || '', item.localizacao?.lng || '', item.localizacao?.posteId || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `erros_${nomeOS}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarTXT = () => {
    let texto = `RELATÓRIO DE ERROS E AVISOS\nProjeto: ${nomeOS}\nData: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n`;
    texto += `RESUMO:\n- Erros: ${erros.length}\n- Avisos: ${avisos.length}\n- Info: ${infos.length}\n\n`;

    if (erros.length > 0) {
      texto += `\n### ERROS ###\n`;
      erros.forEach((e, i) => {
        texto += `${i + 1}. [${e.categoria}] ${e.mensagem}\n`;
        if (e.detalhe) texto += `   Detalhe: ${e.detalhe}\n`;
        if (e.sugestao) texto += `   Sugestão: ${e.sugestao}\n`;
      });
    }

    if (avisos.length > 0) {
      texto += `\n### AVISOS ###\n`;
      avisos.forEach((a, i) => { texto += `${i + 1}. [${a.categoria}] ${a.mensagem}\n`; });
    }

    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `relatorio_${nomeOS}_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const TipoIcon = ({ tipo }: { tipo: 'ERRO' | 'AVISO' | 'INFO' }) => (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
      tipo === 'ERRO' ? 'bg-red-100 text-red-600' : tipo === 'AVISO' ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-100 text-blue-600'
    }`}>
      {tipo === 'ERRO' ? '✕' : tipo === 'AVISO' ? '!' : 'i'}
    </span>
  );

  return (
    <div className="bg-white rounded-lg shadow-lg">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Erros e Avisos</h2>
          <div className="flex gap-2">
            <button onClick={exportarCSV} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700">CSV</button>
            <button onClick={exportarTXT} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">TXT</button>
          </div>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-sm font-medium text-red-700">{erros.length} Erros</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-yellow-50 rounded-full">
            <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
            <span className="text-sm font-medium text-yellow-700">{avisos.length} Avisos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span className="text-sm font-medium text-blue-700">{infos.length} Info</span>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as any)} className="px-3 py-1.5 border rounded text-sm">
            <option value="todos">Todos</option>
            <option value="ERRO">Erros</option>
            <option value="AVISO">Avisos</option>
            <option value="INFO">Info</option>
          </select>
          <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className="px-3 py-1.5 border rounded text-sm">
            {categorias.map(cat => <option key={cat} value={cat}>{cat === 'todas' ? 'Todas categorias' : cat}</option>)}
          </select>
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="flex-1 min-w-[150px] px-3 py-1.5 border rounded text-sm" />
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto divide-y">
        {itensFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum item encontrado</div>
        ) : (
          itensFiltrados.map((item) => (
            <div key={item.id} onClick={() => toggleExpansao(item.id)}
              className={`p-4 hover:bg-gray-50 cursor-pointer border-l-4 ${
                item.tipo === 'ERRO' ? 'border-l-red-500' : item.tipo === 'AVISO' ? 'border-l-yellow-500' : 'border-l-blue-500'
              }`}>
              <div className="flex items-start gap-3">
                <TipoIcon tipo={item.tipo} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{item.categoria}</span>
                    {item.localizacao?.posteId && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-600 rounded">{item.localizacao.posteId}</span>}
                  </div>
                  <p className="text-sm font-medium">{item.mensagem}</p>
                  
                  {expandido.has(item.id) && (
                    <div className="mt-3 space-y-2 text-sm">
                      {item.detalhe && <div className="p-2 bg-gray-50 rounded"><span className="text-gray-500">Detalhe:</span> {item.detalhe}</div>}
                      {item.sugestao && <div className="p-2 bg-green-50 rounded text-green-700">💡 {item.sugestao}</div>}
                      {item.regra && <div className="p-2 bg-blue-50 rounded text-blue-700">📋 {item.regra}</div>}
                      {item.localizacao && onLocalizarNoMapa && (
                        <button onClick={(e) => { e.stopPropagation(); onLocalizarNoMapa(item.localizacao!.lat, item.localizacao!.lng); }}
                          className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200">
                          📍 Ver no mapa
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className={`text-gray-400 transition-transform ${expandido.has(item.id) ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="p-4 border-t bg-gray-50 text-sm text-gray-500">Exibindo {itensFiltrados.length} de {todosItens.length} itens</div>
    </div>
  );
};

export default ListaErros;
