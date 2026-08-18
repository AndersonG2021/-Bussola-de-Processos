/**
 * Configuração global do frontend.
 *
 * APPS_SCRIPT_URL deve receber a URL do Web App do Google Apps Script
 * gerada no deploy do backend (ver README.md, seção "Roteiro manual").
 * Formato esperado: https://script.google.com/macros/s/AKfycb.../exec
 *
 * Enquanto estiver vazia, chamarBackend() falha com erro explícito.
 */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwDRH5JzBJ5Tf4PETQk3hYj-aY38dki8XTomYGP-r3-ZQ71rOBbEc9z4K0BLILjhDYIlA/exec';

/** Nome da aplicação, usado em títulos e cabeçalhos. */
const APP_NOME = 'Bússola de Processos';

/** Chave usada para guardar a sessão do usuário no navegador. */
const STORAGE_CHAVE_SESSAO = 'bussola.sessao';

/** Tempo máximo (ms) de espera por uma resposta do backend. */
const TIMEOUT_BACKEND_MS = 30000;
