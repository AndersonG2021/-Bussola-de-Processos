/**
 * Router.gs — contrato único da API do Web App.
 *
 * doPost recebe um corpo JSON { action, token, payload } e despacha para
 * a função registrada em ACOES_POST. doGet só aceita ?action=ping (ver
 * ESQUEMA.md, seção "Contrato da API") — GET nunca deve disparar ações
 * que leem ou gravam dados, porque pode ser acionado sem querer (link
 * prefetching de navegador, crawler, etc.).
 *
 * Conforme as telas forem implementadas (login, consulta de processo,
 * upload de documento...), cada action nova entra no mapa ACOES_POST,
 * apontando para a função responsável no arquivo do domínio dela
 * (Auth.gs, Planilha.gs, Arquivo.gs...).
 */

const ACOES_POST = {
  ping: acaoPing,
  // login: autenticar,   // Auth.gs — próxima etapa
};

// Subconjunto de ACOES_POST liberado também via GET. Mantenha só ações
// de leitura sem efeito colateral (hoje, só o healthcheck).
const ACOES_GET = {
  ping: acaoPing,
};

/**
 * @param {{action: string, payload: Object, token: string}} requisicao
 * @returns {{ok: boolean, data?: *, erro?: string}}
 */
function rotearRequisicaoPost(requisicao) {
  const acao = requisicao && requisicao.action;

  if (!acao || !ACOES_POST[acao]) {
    return { ok: false, erro: 'Ação desconhecida ou ainda não implementada: ' + acao };
  }

  return ACOES_POST[acao](requisicao.payload || {}, requisicao.token || null);
}

/**
 * @param {Object} parametros  e.parameter do doGet (query string).
 * @returns {{ok: boolean, data?: *, erro?: string}}
 */
function rotearRequisicaoGet(parametros) {
  const acao = parametros && parametros.action;

  if (!acao || !ACOES_GET[acao]) {
    return { ok: false, erro: 'Ação desconhecida ou não permitida via GET: ' + acao };
  }

  return ACOES_GET[acao]({}, null);
}

/**
 * Healthcheck simples — confirma que o Web App está no ar sem tocar em
 * planilha/Drive. Usado tanto em GET (?action=ping) quanto em POST.
 * @returns {{ok: boolean, data: {pong: boolean, servidor: string}}}
 */
function acaoPing() {
  return { ok: true, data: { pong: true, servidor: new Date().toISOString() } };
}
