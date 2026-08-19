/**
 * Utilitarios.gs — funções auxiliares compartilhadas entre os
 * demais arquivos do backend.
 */

/**
 * Converte um array de bytes (ex.: retorno de Utilities.computeDigest)
 * em uma string hexadecimal minúscula. Usada tanto pelo hash de senha
 * (Auth.gs) quanto pelo hash de conteúdo de arquivo (Arquivo.gs) — não
 * duplique essa conversão em outro lugar.
 * @param {number[]} bytes
 * @returns {string}
 */
function bytesParaHex(bytes) {
  return bytes.map(function (byte) {
    const hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
