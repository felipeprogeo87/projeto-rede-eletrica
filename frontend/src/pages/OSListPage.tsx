import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface OS {
  id: number;
  numero_os: string;
  cliente_nome?: string;
  municipio?: string;
  tipo_projeto: string;
  tipo_rede: string;
  status: string;
  created_at: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const OSListPage: React.FC = () => {
  const navigate = useNavigate();
  const [osList, setOsList] = useState<OS[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/os`)
      .then(res => res.json())
      .then(data => {
        // API retorna array diretamente, não { data: [...] }
        if (Array.isArray(data)) {
          setOsList(data);
        } else if (data.data) {
          setOsList(data.data);
        } else {
          setOsList([]);
        }
      })
      .catch(err => setErro(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'CONCLUIDO': return '#22c55e';
      case 'EM_ANDAMENTO': return '#3b82f6';
      case 'PENDENTE': return '#f59e0b';
      case 'CANCELADO': return '#ef4444';
      default: return '#64748b';
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div style={styles.container}>
        <div style={styles.erro}>
          <p>❌ Erro ao carregar: {erro}</p>
          <button onClick={() => window.location.reload()} style={styles.btnRetry}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>📋 Ordens de Serviço</h1>
        <Link to="/os/nova" style={styles.btnNova}>
          ➕ Nova OS
        </Link>
      </div>

      {osList.length === 0 ? (
        <div style={styles.vazio}>
          <p>Nenhuma ordem de serviço encontrada.</p>
          <Link to="/os/nova" style={styles.btnNova}>
            Criar primeira OS
          </Link>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.tabela}>
            <thead>
              <tr>
                <th style={styles.th}>Número</th>
                <th style={styles.th}>Município</th>
                <th style={styles.th}>Tipo</th>
                <th style={styles.th}>Rede</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {osList.map(os => (
                <tr key={os.id} style={styles.tr}>
                  <td style={styles.td}>
                    <strong>{os.numero_os}</strong>
                  </td>
                  <td style={styles.td}>{os.municipio || os.cliente_nome || '-'}</td>
                  <td style={styles.td}>{os.tipo_projeto?.replace(/_/g, ' ') || '-'}</td>
                  <td style={styles.td}>{os.tipo_rede?.replace(/_/g, ' ') || '-'}</td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      background: getStatusColor(os.status) + '20',
                      color: getStatusColor(os.status),
                    }}>
                      {os.status || 'PENDENTE'}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <div style={styles.acoes}>
                      <button
                        onClick={() => navigate(`/os/${os.id}/gerar`)}
                        style={styles.btnAcao}
                        title="Gerar Projeto"
                      >
                        ⚡
                      </button>
                      <button
                        onClick={() => navigate(`/os/${os.id}/visualizar`)}
                        style={styles.btnAcao}
                        title="Visualizar no Mapa"
                      >
                        🗺️
                      </button>
                      <button
                        onClick={() => navigate(`/os/${os.id}/editar`)}
                        style={styles.btnAcao}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  btnNova: {
    display: 'inline-block',
    padding: '12px 24px',
    background: '#3b82f6',
    color: 'white',
    textDecoration: 'none',
    borderRadius: '8px',
    fontWeight: '600',
  },
  erro: {
    padding: '24px',
    background: '#fee2e2',
    borderRadius: '8px',
    textAlign: 'center' as const,
  },
  btnRetry: {
    marginTop: '12px',
    padding: '8px 16px',
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  vazio: {
    padding: '60px',
    background: 'white',
    borderRadius: '12px',
    textAlign: 'center' as const,
    color: '#64748b',
  },
  tableContainer: {
    background: 'white',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  tabela: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    textAlign: 'left' as const,
    padding: '16px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase' as const,
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
  },
  td: {
    padding: '16px',
    fontSize: '14px',
    color: '#334155',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
  },
  acoes: {
    display: 'flex',
    gap: '8px',
  },
  btnAcao: {
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer',
  },
};

export default OSListPage;
