/**
 * Auth.gs — autenticação e validação de sessão.
 *
 * Responsabilidade futura: validar credenciais contra a aba de
 * usuários da planilha, emitir/validar tokens de sessão e checar
 * esse token em toda ação que exigir login.
 *
 * STUB: nenhuma lógica implementada ainda.
 */

/**
 * @param {{email: string, senha: string}} payload
 * @returns {{ok: boolean, data?: *, erro?: string}}
 */
function autenticar(payload) {
  return { ok: false, erro: 'Não implementado.' };
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function validarToken(token) {
  return false;
}
