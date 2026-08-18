/**
 * Router.gs — despacha cada `action` recebida do frontend para a
 * função responsável.
 *
 * STUB: o mapa de ações está vazio. Conforme as telas forem
 * implementadas (login, consulta de processo, etc.), cada uma
 * registra sua função aqui.
 */

/**
 * @param {{action: string, payload: Object, token: string}} requisicao
 * @returns {{ok: boolean, data?: *, erro?: string}}
 */
function rotearRequisicao(requisicao) {
  const acao = requisicao && requisicao.action;

  const acoesDisponiveis = {
    // login: Auth.autenticar,
  };

  if (!acao || !acoesDisponiveis[acao]) {
    return { ok: false, erro: 'Ação desconhecida ou ainda não implementada: ' + acao };
  }

  return acoesDisponiveis[acao](requisicao.payload || {}, requisicao.token || null);
}
