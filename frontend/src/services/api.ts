// @deprecated Este módulo não é importado por nenhum componente.
// Todos os componentes usam fetch() diretamente com API_URL.
// Mantido para referência. Se necessário, use:
//   const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
  timeout: 120000,
});

export default api;