/**
 * Principal.gs — pontos de entrada do Web App (Google Apps Script).
 *
 * Todo acesso de fora (frontend estático no GitHub Pages) chega aqui.
 * Este é o único projeto com permissão de escrita sobre a planilha
 * (Google Sheets) e o Drive; nada disso é exposto diretamente ao
 * frontend — tudo passa pelo Router.gs.
 *
 * Contrato da API (ver backend/ESQUEMA.md para detalhes):
 *   - POST: corpo JSON { action, token, payload } → despachado por
 *     rotearRequisicaoPost em Router.gs.
 *   - GET: só aceita ?action=ping (healthcheck) → rotearRequisicaoGet.
 *
 * STUB: só a action "ping" está implementada; as demais entram conforme
 * as telas forem construídas.
 */

/**
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  const parametros = (e && e.parameter) || {};
  return responderJson(rotearRequisicaoGet(parametros));
}

/**
 * Único ponto de entrada de escrita/ação usado pelo frontend (via
 * chamarBackend em assets/js/api.js). Espera um corpo JSON:
 * { action, payload, token }.
 *
 * O corpo chega como text/plain (não application/json) de propósito —
 * ver o comentário em assets/js/api.js e ESQUEMA.md: isso evita que o
 * navegador dispare um preflight OPTIONS, que o Apps Script não sabe
 * responder. Por isso o parse é manual aqui.
 *
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const requisicao = JSON.parse((e.postData && e.postData.contents) || '{}');
    return responderJson(rotearRequisicaoPost(requisicao));
  } catch (erro) {
    return responderJson({ ok: false, erro: erro.message || String(erro) });
  }
}

/**
 * Serializa a resposta como JSON puro (sem preflight CORS, ver api.js).
 * @param {Object} corpo
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function responderJson(corpo) {
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}
