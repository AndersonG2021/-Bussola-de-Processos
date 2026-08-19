/**
 * Router.gs — contrato único da API do Web App.
 *
 * doPost recebe um corpo JSON { action, token, payload } e despacha para
 * a função registrada em ACOES_POST. doGet só aceita ?action=ping (ver
 * ESQUEMA.md, seção "Contrato da API").
 *
 * Autorização: toda action que não esteja em ACOES_PUBLICAS exige um
 * token de sessão válido e não expirado (validarSessao, em Auth.gs)
 * antes de rodar. Se a sessão não validar, a resposta vem com
 * `codigo: 'SESSAO_INVALIDA'` — o frontend (chamarBackend, em
 * assets/js/api.js) usa esse código pra deslogar e voltar ao login
 * automaticamente em qualquer chamada, não só no login em si.
 *
 * Toda função de action recebe (payload, sessao): `sessao` é o objeto
 * devolvido por validarSessao ({token, usuarioId, perfil, nome}) para
 * actions protegidas, ou `null` para as públicas.
 */

// Ações que NÃO exigem sessão válida.
const ACOES_PUBLICAS = ['ping', 'login'];

const ACOES_POST = {
  ping: acaoPing,
  login: acaoLogin,
  meuPerfil: acaoMeuPerfil,
  // Próximas ações (protegidas por padrão): registrem aqui.
};

// Subconjunto de ACOES_POST liberado também via GET. Mantenha só ações
// de leitura sem efeito colateral (hoje, só o healthcheck).
const ACOES_GET = {
  ping: acaoPing,
};

/**
 * @param {{action: string, payload: Object, token: string}} requisicao
 * @returns {{ok: boolean, data?: *, erro?: string, codigo?: string}}
 */
function rotearRequisicaoPost(requisicao) {
  const acao = requisicao && requisicao.action;

  if (!acao || !ACOES_POST[acao]) {
    return { ok: false, erro: 'Ação desconhecida ou ainda não implementada: ' + acao };
  }

  const payload = requisicao.payload || {};

  if (ACOES_PUBLICAS.indexOf(acao) !== -1) {
    return ACOES_POST[acao](payload, null);
  }

  const sessao = validarSessao(requisicao.token);
  if (!sessao) {
    return {
      ok: false,
      erro: 'Sessão expirada ou inválida. Faça login novamente.',
      codigo: 'SESSAO_INVALIDA',
    };
  }
  return ACOES_POST[acao](payload, sessao);
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
