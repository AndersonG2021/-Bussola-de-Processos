/**
 * Camada única de comunicação com o backend (Google Apps Script Web App).
 *
 * O frontend NUNCA fala com Google Sheets ou Google Drive diretamente:
 * toda leitura e escrita passa por aqui e é resolvida pelo Apps Script,
 * que é o único com permissão sobre a planilha e o Drive.
 *
 * Depende de assets/js/config.js (APPS_SCRIPT_URL, TIMEOUT_BACKEND_MS).
 */

/**
 * Envia uma requisição ao Web App.
 *
 * O corpo vai como texto simples (text/plain) de propósito: com
 * application/json o navegador dispara um preflight OPTIONS, que o
 * Apps Script não sabe responder. O backend faz JSON.parse do corpo.
 *
 * @param {string} action  Nome da operação tratada pelo Router.gs (ex.: 'login').
 * @param {Object} [payload]  Dados da operação.
 * @returns {Promise<*>}  Conteúdo do campo `data` da resposta do backend.
 * @throws {Error}  Se a URL não estiver configurada, se a rede falhar,
 *                  se estourar o timeout ou se o backend responder ok:false.
 */
async function chamarBackend(action, payload = {}) {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      'APPS_SCRIPT_URL não configurada. Preencha assets/js/config.js com a ' +
      'URL do Web App gerada no deploy do Apps Script.'
    );
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_BACKEND_MS);

  let resposta;
  try {
    resposta = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // Evita o preflight CORS; o Apps Script lê e2.postData.contents.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, token: obterToken() }),
      redirect: 'follow',
      signal: controle.signal,
    });
  } catch (erro) {
    if (erro.name === 'AbortError') {
      throw new Error('O servidor demorou demais para responder. Tente novamente.');
    }
    throw new Error('Não foi possível falar com o servidor: ' + erro.message);
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok) {
    throw new Error('Servidor respondeu com erro HTTP ' + resposta.status + '.');
  }

  const texto = await resposta.text();
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch (_) {
    // Resposta em HTML costuma indicar tela de login do Google:
    // o Web App não está publicado com acesso "qualquer pessoa".
    throw new Error('Resposta inesperada do servidor (não é JSON). Confira a publicação do Web App.');
  }

  if (!corpo.ok) {
    // Sessão expirada/inválida em QUALQUER chamada (não só login): desloga
    // e manda de volta pro login, de forma centralizada — nenhuma tela
    // precisa tratar isso na mão. Ver Router.gs no backend (codigo
    // SESSAO_INVALIDA é devolvido por validarSessao).
    if (corpo.codigo === 'SESSAO_INVALIDA') {
      limparSessao();
      redirecionarParaLogin();
    }
    const erro = new Error(corpo.erro || 'O servidor recusou a operação.');
    erro.codigo = corpo.codigo || null;
    throw erro;
  }
  return corpo.data;
}

/**
 * Recupera a sessão salva no navegador.
 *
 * Usa sessionStorage (não localStorage) de propósito: some quando a
 * aba fecha, então a sessão não fica "logada pra sempre" num
 * computador compartilhado. A expiração de verdade (8h) é controlada
 * pelo backend (Sessoes.expira_em) — isto aqui só evita mostrar telas
 * protegidas antes de qualquer chamada real confirmar a sessão.
 * @returns {Object|null}
 */
function obterSessao() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_CHAVE_SESSAO)) || null;
  } catch (_) {
    return null;
  }
}

/**
 * Guarda a sessão devolvida pelo backend após o login (token, perfil, nome).
 * @param {Object} sessao
 */
function salvarSessao(sessao) {
  sessionStorage.setItem(STORAGE_CHAVE_SESSAO, JSON.stringify(sessao));
}

/** Apaga a sessão local (logout). */
function limparSessao() {
  sessionStorage.removeItem(STORAGE_CHAVE_SESSAO);
}

/**
 * Manda o navegador para a tela de login. Todas as páginas protegidas
 * vivem no mesmo nível de pasta que index.html (sem subpastas), então
 * um caminho relativo simples funciona a partir de qualquer uma delas.
 */
function redirecionarParaLogin() {
  window.location.href = 'index.html';
}

/**
 * Token da sessão atual, enviado em toda chamada para o backend validar.
 * @returns {string|null}
 */
function obterToken() {
  const sessao = obterSessao();
  return sessao && sessao.token ? sessao.token : null;
}
