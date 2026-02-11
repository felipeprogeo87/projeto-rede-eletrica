import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface OS {
  id?: number;
  numero_os: string;
  cliente_nome: string;
  cliente_cpf_cnpj: string;
  cliente_telefone: string;
  cliente_email: string;
  cliente_endereco: string;
  tipo_projeto: string;
  distribuidora: string;
  tipo_rede: string;
  tensao_mt: number;
  carga_estimada_kva: number;
  observacoes: string;
  ponto_origem_latitude: number;
  ponto_origem_longitude: number;
  ponto_destino_latitude: number;
  ponto_destino_longitude: number;
  status: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const OSFormPageV2: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<OS>({
    numero_os: '',
    cliente_nome: '',
    cliente_cpf_cnpj: '',
    cliente_telefone: '',
    cliente_email: '',
    cliente_endereco: '',
    tipo_projeto: 'EXTENSAO_MT',
    distribuidora: 'EQUATORIAL',
    tipo_rede: 'mt_convencional',
    tensao_mt: 13.8,
    carga_estimada_kva: 75,
    observacoes: '',
    ponto_origem_latitude: -2.5,
    ponto_origem_longitude: -44.0,
    ponto_destino_latitude: -2.5,
    ponto_destino_longitude: -44.0,
    status: 'PENDENTE',
  });

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      fetch(`${API_URL}/os/${id}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.id) setForm(data);
          else if (data.data) setForm(data.data);
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [id, isEdit]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: ['tensao_mt', 'carga_estimada_kva', 'ponto_origem_latitude', 'ponto_origem_longitude', 'ponto_destino_latitude', 'ponto_destino_longitude'].includes(name)
        ? parseFloat(value) || 0
        : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = isEdit ? `${API_URL}/os/${id}` : `${API_URL}/os`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Erro ao salvar OS');
      
      const data = await res.json();
      navigate(`/os/${data?.id || data?.data?.id || id}/visualizar`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Carregando...</div>;

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>{isEdit ? 'Editar' : 'Nova'} Ordem de Serviço</h1>
      
      {error && (
        <div style={{ padding: '12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label>Número OS</label>
            <input name="numero_os" value={form.numero_os} onChange={handleChange} required style={inputStyle} />
          </div>

          <div>
            <label>Cliente</label>
            <input name="cliente_nome" value={form.cliente_nome} onChange={handleChange} required style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>CPF/CNPJ</label>
              <input name="cliente_cpf_cnpj" value={form.cliente_cpf_cnpj} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label>Telefone</label>
              <input name="cliente_telefone" value={form.cliente_telefone} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          <div>
            <label>Endereço</label>
            <input name="cliente_endereco" value={form.cliente_endereco} onChange={handleChange} style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>Tipo de Projeto</label>
              <select name="tipo_projeto" value={form.tipo_projeto} onChange={handleChange} style={inputStyle}>
                <option value="EXTENSAO_MT">Extensão MT</option>
                <option value="EXTENSAO_BT">Extensão BT</option>
                <option value="MELHORIA">Melhoria</option>
                <option value="REFORCO">Reforço</option>
              </select>
            </div>
            <div>
              <label>Tipo de Rede</label>
              <select name="tipo_rede" value={form.tipo_rede} onChange={handleChange} style={inputStyle}>
                <option value="mt_convencional">MT Convencional</option>
                <option value="mt_compacta">MT Compacta</option>
                <option value="bt_multiplexada">BT Multiplexada</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>Tensão MT (kV)</label>
              <input name="tensao_mt" type="number" step="0.1" value={form.tensao_mt} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label>Carga Estimada (kVA)</label>
              <input name="carga_estimada_kva" type="number" value={form.carga_estimada_kva} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          <h3 style={{ marginTop: '16px', marginBottom: '8px' }}>📍 Coordenadas</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>Origem - Latitude</label>
              <input name="ponto_origem_latitude" type="number" step="0.000001" value={form.ponto_origem_latitude} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label>Origem - Longitude</label>
              <input name="ponto_origem_longitude" type="number" step="0.000001" value={form.ponto_origem_longitude} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>Destino - Latitude</label>
              <input name="ponto_destino_latitude" type="number" step="0.000001" value={form.ponto_destino_latitude} onChange={handleChange} style={inputStyle} />
            </div>
            <div>
              <label>Destino - Longitude</label>
              <input name="ponto_destino_longitude" type="number" step="0.000001" value={form.ponto_destino_longitude} onChange={handleChange} style={inputStyle} />
            </div>
          </div>

          <div>
            <label>Observações</label>
            <textarea name="observacoes" value={form.observacoes} onChange={handleChange} rows={3} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button type="submit" disabled={saving} style={btnPrimary}>
              {saving ? 'Salvando...' : '💾 Salvar e Gerar Projeto'}
            </button>
            <button type="button" onClick={() => navigate('/')} style={btnSecondary}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '14px',
  marginTop: '4px',
};

const btnPrimary: React.CSSProperties = {
  padding: '12px 24px',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '12px 24px',
  background: '#f1f5f9',
  color: '#475569',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600',
  cursor: 'pointer',
};

export default OSFormPageV2;
