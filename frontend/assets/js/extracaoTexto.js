/**
 * extracaoTexto.js — extração de texto pesquisável dos documentos,
 * NO NAVEGADOR, antes do upload (Prompt 5). O texto extraído é
 * enviado junto no payload de "uploadDocumento" (ver upload.js) pro
 * backend salvar — decisão de arquitetura: extrair no cliente evita
 * depender do Apps Script pra processar PDF (ele não tem API boa pra
 * isso) e evita estourar o limite de 6 minutos de execução dele.
 *
 * PDF: usa a biblioteca pdf.js, carregada via CDN em upload.html
 * (window.pdfjsLib). HTML: usa DOMParser + textContent do próprio
 * navegador, sem biblioteca externa.
 *
 * Mantenha LIMIAR_TEXTO_EXTRAIDO_CARACTERES em sincronia com
 * backend/Arquivo.gs (o backend reconfere esse limiar de novo, não
 * confia cegamente no `ok` calculado aqui).
 */

const LIMIAR_TEXTO_EXTRAIDO_CARACTERES = 30;

// pdf.js exige apontar pra onde está o worker script (roda a extração
// numa thread separada, sem travar a página). Mesma versão do
// <script> carregado em upload.html — troque os dois juntos.
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Extrai o texto de um arquivo PDF ou HTML.
 * @param {File} arquivo
 * @param {string} mimetype  'application/pdf' ou 'text/html' — outros valores devolvem texto vazio.
 * @returns {Promise<{texto: string, ok: boolean}>}
 *   `ok` é false quando o texto (depois de trim) tem menos de
 *   LIMIAR_TEXTO_EXTRAIDO_CARACTERES caracteres — sinal de PDF
 *   escaneado sem OCR, por exemplo. Nunca rejeita a Promise: qualquer
 *   erro de extração vira `{texto: '', ok: false}`, pra nunca
 *   bloquear o upload do arquivo em si por causa disso.
 */
async function extrairTexto(arquivo, mimetype) {
  let texto = '';
  try {
    if (mimetype === 'application/pdf') {
      texto = await extrairTextoPdf(arquivo);
    } else if (mimetype === 'text/html') {
      texto = await extrairTextoHtml(arquivo);
    }
  } catch (erro) {
    texto = '';
  }

  const textoLimpo = texto.trim();
  return { texto: textoLimpo, ok: textoLimpo.length >= LIMIAR_TEXTO_EXTRAIDO_CARACTERES };
}

/**
 * @param {File} arquivo
 * @returns {Promise<string>}
 */
async function extrairTextoPdf(arquivo) {
  const bufferArray = await arquivo.arrayBuffer();
  const documentoPdf = await pdfjsLib.getDocument({ data: bufferArray }).promise;

  const textoPorPagina = [];
  for (let numeroPagina = 1; numeroPagina <= documentoPdf.numPages; numeroPagina++) {
    const pagina = await documentoPdf.getPage(numeroPagina);
    const conteudo = await pagina.getTextContent();
    const textoPagina = conteudo.items.map(function (item) { return item.str; }).join(' ');
    textoPorPagina.push(textoPagina);
  }

  return textoPorPagina.join('\n\n');
}

/**
 * @param {File} arquivo
 * @returns {Promise<string>}
 */
async function extrairTextoHtml(arquivo) {
  const conteudoHtml = await arquivo.text();
  const parser = new DOMParser();
  const documento = parser.parseFromString(conteudoHtml, 'text/html');
  return (documento.body && documento.body.textContent) || '';
}
