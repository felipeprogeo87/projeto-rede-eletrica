import React from 'react';
import { Link } from 'react-router-dom';

const HomePage: React.FC = () => {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔌 Sistema de Projetos Elétricos</h1>
      <p style={{ fontSize: '18px', color: '#64748b', marginBottom: '32px' }}>
        Geração automática de projetos de rede de distribuição
      </p>
      
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Link 
          to="/os/nova" 
          style={{
            display: 'inline-block',
            padding: '16px 32px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '16px',
          }}
        >
          ➕ Nova Ordem de Serviço
        </Link>
        
        <Link 
          to="/os" 
          style={{
            display: 'inline-block',
            padding: '16px 32px',
            background: '#f1f5f9',
            color: '#475569',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '16px',
          }}
        >
          📋 Listar OS
        </Link>
      </div>
    </div>
  );
};

export default HomePage;
