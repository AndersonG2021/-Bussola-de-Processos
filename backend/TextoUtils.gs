/**
 * TextoUtils.gs — utilitários de texto compartilhados pelas próximas
 * funcionalidades de reconhecimento de padrões (identificação de
 * tipo/etapa do processo, checklist, divergências). O texto sobre o
 * qual essas funções operam vem da extração feita no navegador no
 * momento do upload (ver ESQUEMA.md, seção "Texto extraído dos
 * documentos", e frontend/assets/js/extracaoTexto.js).
 */

/**
 * Busca quais palavras/expressões de `listaPalavras` aparecem em
 * `texto` — comparação sem diferenciar maiúsculas/minúsculas nem
 * acentuação (ver normalizarTexto), pra "não regular" bater com "Não
 * Regular" ou "nao regular" igual.
 *
 * @param {string} texto
 * @param {string[]} listaPalavras
 * @returns {string[]}  subconjunto de listaPalavras que apareceu no texto,
 *   na mesma grafia em que foi passada (não normalizada) — quem chama
 *   decide se quer só saber "bateu alguma?" (`.length > 0`), contar
 *   quantas, ou exibir quais.
 */
function buscarPalavrasChave(texto, listaPalavras) {
  if (!texto || !listaPalavras || listaPalavras.length === 0) return [];

  const textoNormalizado = normalizarTexto(texto);
  return listaPalavras.filter(function (palavra) {
    return palavra && textoNormalizado.indexOf(normalizarTexto(palavra)) !== -1;
  });
}

/**
 * Minúsculo e sem diacríticos (acentos, til, cedilha etc.) — usado
 * antes de qualquer busca de palavra-chave no texto de um documento.
 *
 * A faixa de diacríticos combinantes (Unicode 0x0300 a 0x036F) é
 * montada por código com String.fromCharCode em vez de escrita como
 * escape de Unicode ou caractere literal no fonte — evita risco de
 * corrupção de encoding ao salvar/sincronizar este arquivo (já
 * aconteceu num commit deste projeto).
 * @param {string} texto
 * @returns {string}
 */
function normalizarTexto(texto) {
  const inicioDiacriticos = String.fromCharCode(768); // 0x0300
  const fimDiacriticos = String.fromCharCode(879); // 0x036F
  const regexDiacriticos = new RegExp('[' + inicioDiacriticos + '-' + fimDiacriticos + ']', 'g');

  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(regexDiacriticos, '');
}

/**
 * SHA-256 de uma string de texto, em hex. Usado pra saber o que mudou
 * numa reanálise (Funcionalidade 7) sem comparar o texto inteiro de
 * novo — ver DocumentosProcesso.hash_texto_extraido em ESQUEMA.md.
 * @param {string} texto
 * @returns {string}
 */
function calcularHashTexto(texto) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytesParaHex(digest);
}
