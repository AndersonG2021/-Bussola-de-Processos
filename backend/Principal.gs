/**
 * Principal.gs — pontos de entrada do Web App (Google Apps Script).
 *
 * Todo acesso de fora (frontend estático no GitHub Pages) chega aqui.
 * Este é o único projeto com permissão de escrita sobre a planilha
 * (Google Sheets) e o Drive; nada disso é exposto diretamente ao
 * frontend — tudo passa pelo Router.gs.
 *
 * STUB: nesta etapa só existe o encaminhamento para o Router; nenhuma
 * regra de negócio foi implementada ainda.
 */

/**
 * GET é usado apenas para verificação manual (ex.: abrir a URL do Web
 * App no navegador). As operações reais do app usam POST.
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return responderJson({ ok: true, data: { status: 'Bússola de Processos — backend ativo' } });
}

/**
 * Único ponto de entrada usado pelo frontend (via chamarBackend em
 * assets/js/api.js). Espera um corpo JSON: { action, payload, token }.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const requisicao = JSON.parse(e.postData.contents || '{}');
    return responderJson(rotearRequisicao(requisicao));
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
