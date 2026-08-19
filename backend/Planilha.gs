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

/**
 * Busca a primeira linha de uma aba cujo valor na coluna informada bate
 * (comparação estrita ===) com `valor`. Usada por Auth.gs para achar
 * usuário por login e sessão por token, mas serve pra qualquer busca
 * simples por igualdade em qualquer aba.
 *
 * @param {string} nomeAba
 * @param {string} nomeColuna  Precisa bater com um nome de coluna do cabeçalho (linha 1).
 * @param {*} valor
 * @returns {{linha: number, valores: Object}|null}
 *   `linha` é o número da linha na planilha (1-indexado, útil pra um
 *   futuro update). `valores` é um objeto {nomeColuna: valor} com a
 *   linha inteira. null se a aba não existir, a coluna não existir, ou
 *   nenhuma linha bater.
 */
function buscarLinhaPorColuna(nomeAba, nomeColuna, valor) {
  const aba = obterPlanilha().getSheetByName(nomeAba);
  if (!aba) return null;

  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const indiceColuna = cabecalho.indexOf(nomeColuna);
  if (indiceColuna === -1) return null;

  for (let i = 1; i < dados.length; i++) {
    if (dados[i][indiceColuna] === valor) {
      const valores = {};
      cabecalho.forEach((coluna, indice) => { valores[coluna] = dados[i][indice]; });
      return { linha: i + 1, valores: valores };
    }
  }
  return null;
}

/**
 * Insere uma linha no final da aba a partir de um objeto
 * {nomeColuna: valor} — a ordem das colunas é resolvida pelo cabeçalho
 * da aba, então quem chama não precisa montar (nem manter em sincronia
 * manualmente) um array posicional. Colunas do cabeçalho ausentes no
 * objeto ficam em branco na linha.
 *
 * @param {string} nomeAba
 * @param {Object} valoresPorColuna
 */
function inserirLinha(nomeAba, valoresPorColuna) {
  const aba = obterPlanilha().getSheetByName(nomeAba);
  if (!aba) throw new Error('inserirLinha: aba "' + nomeAba + '" não existe.');

  const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  const linha = cabecalho.map(function (coluna) {
    return Object.prototype.hasOwnProperty.call(valoresPorColuna, coluna) ? valoresPorColuna[coluna] : '';
  });
  aba.appendRow(linha);
}

/**
 * Atualiza só as colunas informadas de uma linha já existente
 * (identificada pelo número de linha — ex.: o `linha` devolvido por
 * buscarLinhaPorColuna). As demais colunas da linha não são tocadas.
 *
 * @param {string} nomeAba
 * @param {number} linha  1-indexado (a linha 1 é o cabeçalho).
 * @param {Object} valoresPorColuna  {nomeColuna: novoValor}
 */
function atualizarLinha(nomeAba, linha, valoresPorColuna) {
  const aba = obterPlanilha().getSheetByName(nomeAba);
  if (!aba) throw new Error('atualizarLinha: aba "' + nomeAba + '" não existe.');

  const cabecalho = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  Object.keys(valoresPorColuna).forEach(function (coluna) {
    const indice = cabecalho.indexOf(coluna);
    if (indice === -1) {
      throw new Error('atualizarLinha: coluna "' + coluna + '" não existe em "' + nomeAba + '".');
    }
    aba.getRange(linha, indice + 1).setValue(valoresPorColuna[coluna]);
  });
}
