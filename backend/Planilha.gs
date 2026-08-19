/**
 * Planilha.gs — acesso de baixo nível ao Google Sheets que serve de
 * banco de dados (a lista de abas e colunas está documentada em
 * ESQUEMA.md).
 *
 * Este arquivo guarda só utilitários genéricos de leitura/escrita de
 * abas. Regras de negócio (autenticação, processos, etc.) ficam nos
 * arquivos do domínio delas e chamam essas funções.
 */

/**
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function obterPlanilha() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Garante que a aba existe e que a linha 1 tem exatamente o cabeçalho
 * informado (cria a aba se não existir; corrige o cabeçalho se estiver
 * diferente). Não mexe nas linhas de dados existentes.
 *
 * @param {string} nomeAba
 * @param {string[]} cabecalho
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function obterOuCriarAba(nomeAba, cabecalho) {
  const planilha = obterPlanilha();
  let aba = planilha.getSheetByName(nomeAba);

  if (!aba) {
    aba = planilha.insertSheet(nomeAba);
  }

  const cabecalhoAtual = aba.getRange(1, 1, 1, cabecalho.length).getValues()[0];
  const cabecalhoDiferente = cabecalho.some((coluna, indice) => cabecalhoAtual[indice] !== coluna);
  if (cabecalhoDiferente) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold');
    aba.setFrozenRows(1);
  }

  return aba;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @returns {boolean}  true se a aba só tem o cabeçalho (ou está vazia).
 */
function abaEstaVazia(aba) {
  return aba.getLastRow() <= 1;
}

/**
 * Insere `linhas` no final da aba, mas só se ela ainda não tiver dados
 * (além do cabeçalho). Usado pelo seed (Seed.gs) para não duplicar
 * dados a cada nova execução.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aba
 * @param {Array<Array<*>>} linhas
 * @returns {boolean}  true se inseriu, false se a aba já tinha dados.
 */
function inserirLinhasSeVazia(aba, linhas) {
  if (!abaEstaVazia(aba) || linhas.length === 0) {
    return false;
  }
  aba.getRange(2, 1, linhas.length, linhas[0].length).setValues(linhas);
  return true;
}
