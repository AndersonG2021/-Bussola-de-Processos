/**
 * Identificacao.gs — reconhecimento automático de tipo/subtipo do
 * processo (Funcionalidade 3), por correspondência de padrões contra a
 * base de regras (SubtiposPleito.palavras_chave). Sem IA generativa —
 * é contagem de palavras-chave, igual ao resto do app.
 *
 * O resultado é salvo em RascunhoIdentificacao (ver ESQUEMA_ABAS em
 * Seed.gs), NÃO em AnalisesHistorico — esse rascunho é sobrescrito a
 * cada nova identificação/confirmação do mesmo processo. Só vira
 * versão final do histórico quando a Funcionalidade 6 for
 * implementada.
 */

/** Confiança mínima pra considerar a identificação automática (segue sem revisão manual). */
const LIMIAR_CONFIANCA_AUTOMATICA = 0.7;

/** Abaixo disso, nem palpite — "tipo não reconhecido pela base de regras". */
const LIMIAR_CONFIANCA_MINIMA = 0.3;

/** Nome da regra em RegrasEspeciais que guarda o teto de dispensa de TA. */
const NOME_REGRA_TETO_DISPENSA_TA = 'teto_dispensa_ta_aquisicao_bem_custeio';

/**
 * Action "identificarTipo" (protegida). Payload: { numero_processo }.
 * @param {{numero_processo: string}} payload
 * @param {{token: string, usuarioId: string, perfil: string, nome: string}} sessao
 * @returns {{ok: boolean, data?: Object, erro?: string, codigo?: string}}
 */
function acaoIdentificarTipo(payload, sessao) {
  const numeroProcesso = String((payload && payload.numero_processo) || '').trim();
  if (!numeroProcesso) {
    return { ok: false, erro: 'Número do processo é obrigatório.', codigo: 'PROCESSO_VAZIO' };
  }

  const processo = buscarLinhaPorColuna('Processos', 'numero_processo', numeroProcesso);
  if (!processo) {
    return {
      ok: false,
      erro: 'Processo não encontrado — envie ao menos um documento antes de identificar o tipo.',
      codigo: 'PROCESSO_NAO_ENCONTRADO',
    };
  }

  const textoCompleto = obterTextoCompletoProcesso(numeroProcesso);
  if (!textoCompleto) {
    const resultadoSemTexto = {
      reconhecido: false,
      motivo: 'Nenhum texto extraído disponível para este processo (documentos ainda não enviados, ou todos são PDFs escaneados sem OCR).',
      candidatos: [],
    };
    salvarResultadoIdentificacao(numeroProcesso, sessao, resultadoSemTexto);
    return { ok: true, data: resultadoSemTexto };
  }

  const pontuacoes = listarSubtiposPleito()
    .map(function (subtipo) { return calcularPontuacaoSubtipo(textoCompleto, subtipo); })
    .sort(function (a, b) { return b.confianca - a.confianca; });

  const melhor = pontuacoes[0];

  if (!melhor || melhor.confianca < LIMIAR_CONFIANCA_MINIMA) {
    const resultadoNaoReconhecido = {
      reconhecido: false,
      motivo: 'Tipo não reconhecido pela base de regras.',
      candidatos: pontuacoes.slice(0, 5),
    };
    salvarResultadoIdentificacao(numeroProcesso, sessao, resultadoNaoReconhecido);
    return { ok: true, data: resultadoNaoReconhecido };
  }

  const confiancaAlta = melhor.confianca >= LIMIAR_CONFIANCA_AUTOMATICA;
  const resultado = {
    reconhecido: true,
    confianca_alta: confiancaAlta,
    tipo_processo: melhor.tipoProcesso,
    subtipo_pleito: melhor.subtipo,
    confianca: melhor.confianca,
    palavras_encontradas: melhor.palavrasEncontradas,
    total_palavras: melhor.totalPalavras,
    dispensa_ta: avaliarDispensaTA(melhor, textoCompleto),
    candidatos: pontuacoes.slice(0, 5),
  };

  salvarResultadoIdentificacao(numeroProcesso, sessao, resultado);
  return { ok: true, data: resultado };
}

/**
 * Action "confirmarIdentificacaoManual" (protegida) — usada quando a
 * confiança automática é baixa (ou o tipo não foi reconhecido) e o
 * analista escolhe manualmente no dropdown do frontend. Payload:
 * { numero_processo, tipo_processo, subtipo_pleito }.
 * @param {{numero_processo: string, tipo_processo: string, subtipo_pleito: string}} payload
 * @param {{token: string, usuarioId: string, perfil: string, nome: string}} sessao
 * @returns {{ok: boolean, data?: Object, erro?: string, codigo?: string}}
 */
function acaoConfirmarIdentificacaoManual(payload, sessao) {
  const numeroProcesso = String((payload && payload.numero_processo) || '').trim();
  const tipoProcesso = String((payload && payload.tipo_processo) || '').trim();
  const subtipoPleito = String((payload && payload.subtipo_pleito) || '').trim();

  if (!numeroProcesso || !tipoProcesso || !subtipoPleito) {
    return { ok: false, erro: 'Número do processo, tipo e subtipo são obrigatórios.', codigo: 'DADOS_INCOMPLETOS' };
  }

  // O dropdown do frontend só oferece opções válidas, mas o backend não
  // confia cegamente no que vem do cliente — mesmo padrão do resto do app.
  const combinacaoValida = listarSubtiposPleito().some(function (s) {
    return s.subtipo === subtipoPleito && s.tipoProcesso === tipoProcesso;
  });
  if (!combinacaoValida) {
    return { ok: false, erro: 'Combinação de tipo/subtipo não encontrada na base de regras.', codigo: 'SUBTIPO_INVALIDO' };
  }

  salvarResultadoIdentificacao(numeroProcesso, sessao, {
    reconhecido: true,
    confianca_alta: true,
    tipo_processo: tipoProcesso,
    subtipo_pleito: subtipoPleito,
    confianca: 1,
    dispensa_ta: null,
    candidatos: [],
  }, 'manual');

  return { ok: true, data: { numero_processo: numeroProcesso, tipo_processo: tipoProcesso, subtipo_pleito: subtipoPleito } };
}

/**
 * Action "listarSubtiposPleito" (protegida) — catálogo pro dropdown de
 * confirmação manual do frontend. Não devolve palavras_chave (é
 * detalhe interno do algoritmo, o frontend não precisa disso).
 * @returns {{ok: boolean, data: {subtipos: Array<{subtipo: string, tipo_processo: string}>}}}
 */
function acaoListarSubtiposPleito() {
  const subtipos = listarSubtiposPleito().map(function (s) {
    return { subtipo: s.subtipo, tipo_processo: s.tipoProcesso };
  });
  return { ok: true, data: { subtipos: subtipos } };
}

/**
 * Lê SubtiposPleito inteira, já com palavras_chave separada em array.
 * @returns {Array<{subtipo: string, tipoProcesso: string, checklistAssociado: string, palavrasChave: string[]}>}
 */
function listarSubtiposPleito() {
  const aba = obterOuCriarAba('SubtiposPleito', ESQUEMA_ABAS.SubtiposPleito);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxSubtipo = cabecalho.indexOf('subtipo');
  const idxTipo = cabecalho.indexOf('tipo_processo');
  const idxChecklist = cabecalho.indexOf('checklist_associado');
  const idxPalavras = cabecalho.indexOf('palavras_chave');

  const lista = [];
  for (let i = 1; i < dados.length; i++) {
    if (!dados[i][idxSubtipo]) continue;
    const palavrasChaveTexto = String(dados[i][idxPalavras] || '');
    const palavrasChave = palavrasChaveTexto.split(',').map(function (p) { return p.trim(); }).filter(Boolean);
    lista.push({
      subtipo: dados[i][idxSubtipo],
      tipoProcesso: dados[i][idxTipo],
      checklistAssociado: dados[i][idxChecklist],
      palavrasChave: palavrasChave,
    });
  }
  return lista;
}

/**
 * Pontuação de confiança = (nº de padrões encontrados no texto) /
 * (total de padrões esperados pro subtipo). Subtipo sem nenhum padrão
 * cadastrado (palavras_chave vazio na planilha) sempre pontua 0 — não
 * dá pra confiar em nada que não tem critério nenhum.
 * @param {string} texto
 * @param {{subtipo: string, tipoProcesso: string, palavrasChave: string[]}} subtipo
 * @returns {{subtipo: string, tipoProcesso: string, confianca: number, palavrasEncontradas: string[], totalPalavras: number}}
 */
function calcularPontuacaoSubtipo(texto, subtipo) {
  if (subtipo.palavrasChave.length === 0) {
    return {
      subtipo: subtipo.subtipo, tipoProcesso: subtipo.tipoProcesso,
      confianca: 0, palavrasEncontradas: [], totalPalavras: 0,
    };
  }

  const encontradas = buscarPalavrasChave(texto, subtipo.palavrasChave);
  return {
    subtipo: subtipo.subtipo,
    tipoProcesso: subtipo.tipoProcesso,
    confianca: encontradas.length / subtipo.palavrasChave.length,
    palavrasEncontradas: encontradas,
    totalPalavras: subtipo.palavrasChave.length,
  };
}

/**
 * Regra do teto de dispensa de TA (RegrasEspeciais): só se aplica
 * quando o subtipo detectado é "Aquisição de Bens" E o texto menciona
 * "custeio" (aproxima "aquisição de bem via custeio") E há um valor
 * monetário abaixo do teto extraído do texto.
 * @param {{subtipo: string}} melhor
 * @param {string} texto
 * @returns {{sinalizado: true, mensagem: string, teto: number, valores_encontrados: number[]}|null}
 */
function avaliarDispensaTA(melhor, texto) {
  if (!melhor || normalizarTexto(melhor.subtipo) !== normalizarTexto('Aquisição de Bens')) {
    return null;
  }
  if (buscarPalavrasChave(texto, ['custeio']).length === 0) {
    return null;
  }

  const regraTeto = buscarLinhaPorColuna('RegrasEspeciais', 'nome_regra', NOME_REGRA_TETO_DISPENSA_TA);
  if (!regraTeto) return null;

  const teto = Number(regraTeto.valores.valor);
  if (!teto || isNaN(teto)) return null;

  const valoresAbaixoDoTeto = extrairValoresMonetarios(texto).filter(function (v) { return v > 0 && v < teto; });
  if (valoresAbaixoDoTeto.length === 0) return null;

  return {
    sinalizado: true,
    mensagem: 'Pode estar dispensado de TA — exige apenas autorização da Diretora da DGMCG.',
    teto: teto,
    valores_encontrados: valoresAbaixoDoTeto,
  };
}

/**
 * Extrai valores no padrão monetário brasileiro (ex.: "R$ 12.345,67")
 * de um texto e devolve como números (12345.67).
 * @param {string} texto
 * @returns {number[]}
 */
function extrairValoresMonetarios(texto) {
  const regex = /R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const encontrados = texto.match(regex) || [];
  return encontrados
    .map(function (valorTexto) {
      const numeroLimpo = valorTexto.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
      return parseFloat(numeroLimpo);
    })
    .filter(function (numero) { return !isNaN(numero); });
}

/**
 * Grava/atualiza a linha de RascunhoIdentificacao do processo — uma
 * linha por numero_processo, sobrescrita a cada chamada (não é um
 * histórico acumulativo, é o rascunho ATUAL).
 * @param {string} numeroProcesso
 * @param {{nome: string}|null} sessao
 * @param {Object} resultado  Mesmo formato devolvido pelas actions acima.
 * @param {string} [origemForcada]  'manual' quando vem de confirmarIdentificacaoManual.
 */
function salvarResultadoIdentificacao(numeroProcesso, sessao, resultado, origemForcada) {
  obterOuCriarAba('RascunhoIdentificacao', ESQUEMA_ABAS.RascunhoIdentificacao);

  let origem = origemForcada || 'nao-reconhecido';
  if (!origemForcada && resultado.reconhecido) {
    origem = resultado.confianca_alta ? 'automatico-alta-confianca' : 'automatico-baixa-confianca';
  }

  const valores = {
    numero_processo: numeroProcesso,
    tipo_processo: resultado.reconhecido ? resultado.tipo_processo : '',
    subtipo_pleito: resultado.reconhecido ? resultado.subtipo_pleito : '',
    confianca: resultado.reconhecido ? resultado.confianca : 0,
    origem: origem,
    dispensa_ta_json: resultado.dispensa_ta ? JSON.stringify(resultado.dispensa_ta) : '',
    candidatos_json: JSON.stringify(resultado.candidatos || []),
    identificado_por: (sessao && sessao.nome) || 'sistema',
    identificado_em: new Date().toISOString(),
  };

  const existente = buscarLinhaPorColuna('RascunhoIdentificacao', 'numero_processo', numeroProcesso);
  if (existente) {
    atualizarLinha('RascunhoIdentificacao', existente.linha, valores);
  } else {
    inserirLinha('RascunhoIdentificacao', valores);
  }
}
