import { Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import OSFormPageV2 from './pages/OSFormPageV2';
import GerarProjetoPage from './pages/GerarProjetoPage';
import VisualizarProjetoPage from './pages/VisualizarProjetoPage';
import OSListPage from './pages/OSListPage';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  const location = useLocation();

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>⚡ Sistema de Projetos de Redes Elétricas</h1>
        <nav>
          <Link to="/" style={{ fontWeight: location.pathname === '/' ? 'bold' : 'normal' }}>
            🏠 Início
          </Link>
          <Link to="/os" style={{ fontWeight: location.pathname === '/os' ? 'bold' : 'normal' }}>
            📋 Listar OS
          </Link>
          <Link to="/os/nova" style={{ fontWeight: location.pathname === '/os/nova' ? 'bold' : 'normal' }}>
            ➕ Nova OS
          </Link>
        </nav>
      </header>

      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/os" element={<OSListPage />} />
            <Route path="/os/nova" element={<OSFormPageV2 />} />
            <Route path="/os/:id/editar" element={<OSFormPageV2 />} />
            <Route path="/os/:id/gerar" element={<GerarProjetoPage />} />
            <Route path="/os/:id/gerar-projeto" element={<GerarProjetoPage />} />
            <Route path="/os/:id/visualizar" element={<VisualizarProjetoPage />} />
            <Route path="*" element={
              <div className="empty-state">
                <h2>Página não encontrada</h2>
                <p>A URL que você tentou acessar não existe.</p>
                <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                  Voltar para o início
                </Link>
              </div>
            } />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
