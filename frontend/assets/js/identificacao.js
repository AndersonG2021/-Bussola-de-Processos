/**
 * identificacao.js — resultado da identificação automática de
 * tipo/subtipo do processo (Prompt 6), mostrado logo depois do upload
 * de documentos. upload.js chama iniciarIdentificacaoTipo() ao final
 * do lote, se pelo menos um arquivo subiu com sucesso.
 *
 * Depende de config.js, api.js e sessao.js. Espera um elemento
 * #secaoIdentificacao na página (ver upload.html).
 */

let SUBTIPOS_CACHEADOS = null;

/**
 * @param {string} numeroProcesso
 */
async function iniciarIdentificacaoTipo(numeroProcesso) {
  const secao = document.getElementById('secaoIdentificacao');
  if (!secao) return;

  secao.hidden = false;
  secao.innerHTML = '<p class="identificacao__carregando">Identificando tipo do processo...</p>';

  try {
    const resultado = await chamarBackend('identificarTipo', { numero_processo: numeroProcesso });
    renderizarIdentificacao(secao, numeroProcesso, resultado);
  } catch (erro) {
    secao.innerHTML = '<p class="mensagem-erro visivel">Não foi possível identificar o tipo do processo: ' +
      escaparHtml(erro.message) + '</p>';
  }
}

/**
 * @param {HTMLElement} secao
 * @param {string} numeroProcesso
 * @param {Object} resultado
 */
function renderizarIdentificacao(secao, numeroProcesso, resultado) {
  secao.innerHTML = '';

  const titulo = document.createElement('h2');
  titulo.textContent = 'Identificação do processo';
  secao.appendChild(titulo);

  if (!resultado.reconhecido) {
    const aviso = document.createElement('p');
    aviso.className = 'identificacao__aviso identificacao__aviso--baixa';
    aviso.textContent = '❓ ' + (resultado.motivo || 'Tipo não reconhecido pela base de regras.');
    secao.appendChild(aviso);
    secao.appendChild(construirSeletorManual(numeroProcesso, null));
    return;
  }

  const percentual = Math.round(resultado.confianca * 100);

  const palpite = document.createElement('p');
  palpite.className = 'identificacao__palpite';
  const forte = document.createElement('strong');
  forte.textContent = resultado.tipo_processo;
  palpite.appendChild(forte);
  palpite.appendChild(document.createTextNode(' — ' + resultado.subtipo_pleito + ' '));
  const confiancaSpan = document.createElement('span');
  confiancaSpan.className = 'identificacao__confianca';
  confiancaSpan.textContent = '(confiança: ' + percentual + '%)';
  palpite.appendChild(confiancaSpan);
  secao.appendChild(palpite);

  if (resultado.dispensa_ta && resultado.dispensa_ta.sinalizado) {
    const valor = resultado.dispensa_ta.valores_encontrados[0];
    const dispensa = document.createElement('p');
    dispensa.className = 'identificacao__dispensa';
    dispensa.textContent = '💰 ' + resultado.dispensa_ta.mensagem +
      ' (valor encontrado no texto: ' + formatarMoeda(valor) +
      '; teto: ' + formatarMoeda(resultado.dispensa_ta.teto) + ')';
    secao.appendChild(dispensa);
  }

  if (resultado.confianca_alta) {
    const aviso = document.createElement('p');
    aviso.className = 'identificacao__aviso identificacao__aviso--alta';
    aviso.textContent = '✅ Confiança alta — identificação automática.';
    secao.appendChild(aviso);

    const botaoProsseguir = document.createElement('button');
    botaoProsseguir.type = 'button';
    botaoProsseguir.className = 'botao-primario';
    botaoProsseguir.textContent = 'Prosseguir';
    botaoProsseguir.addEventListener('click', function () {
      concluirIdentificacao(secao, 'Identificação confirmada: ' + resultado.tipo_processo + ' — ' + resultado.subtipo_pleito + '.');
    });
    secao.appendChild(botaoProsseguir);
  } else {
    const aviso = document.createElement('p');
    aviso.className = 'identificacao__aviso identificacao__aviso--baixa';
    aviso.textContent = '⚠️ Baixa confiança — confirme ou corrija abaixo antes de prosseguir.';
    secao.appendChild(aviso);
    secao.appendChild(construirSeletorManual(numeroProcesso, resultado));
  }
}

/**
 * Dropdown com todos os tipos/subtipos da base de regras — exige
 * seleção explícita antes de liberar "Confirmar e prosseguir" (o
 * placeholder "Selecione..." não conta como escolha válida).
 * @param {string} numeroProcesso
 * @param {Object|null} resultadoAutomatico  null quando nem chegou a haver palpite.
 * @returns {HTMLElement}
 */
function construirSeletorManual(numeroProcesso, resultadoAutomatico) {
  const container = document.createElement('div');
  container.className = 'identificacao__seletor';

  const label = document.createElement('label');
  label.setAttribute('for', 'seletorSubtipoManual');
  label.textContent = 'Confirme o tipo/subtipo correto:';
  container.appendChild(label);

  const select = document.createElement('select');
  select.id = 'seletorSubtipoManual';
  const opcaoPlaceholder = document.createElement('option');
  opcaoPlaceholder.value = '';
  opcaoPlaceholder.textContent = 'Selecione...';
  select.appendChild(opcaoPlaceholder);
  container.appendChild(select);

  const botaoConfirmar = document.createElement('button');
  botaoConfirmar.type = 'button';
  botaoConfirmar.className = 'botao-primario';
  botaoConfirmar.textContent = 'Confirmar e prosseguir';
  botaoConfirmar.disabled = true;
  container.appendChild(botaoConfirmar);

  const mensagemErro = document.createElement('p');
  mensagemErro.className = 'campo-erro';
  container.appendChild(mensagemErro);

  carregarSubtipos()
    .then(function (subtipos) {
      subtipos.forEach(function (s) {
        const opcao = document.createElement('option');
        opcao.value = s.subtipo + '||' + s.tipo_processo;
        opcao.textContent = s.tipo_processo + ' — ' + s.subtipo +
          (resultadoAutomatico && s.subtipo === resultadoAutomatico.subtipo_pleito ? ' (palpite do sistema)' : '');
        select.appendChild(opcao);
      });
    })
    .catch(function (erro) {
      mensagemErro.textContent = 'Não foi possível carregar a lista de tipos: ' + erro.message;
    });

  select.addEventListener('change', function () {
    botaoConfirmar.disabled = !select.value;
  });

  botaoConfirmar.addEventListener('click', async function () {
    mensagemErro.textContent = '';
    const partes = select.value.split('||');
    const subtipoPleito = partes[0];
    const tipoProcesso = partes[1];

    botaoConfirmar.disabled = true;
    select.disabled = true;
    botaoConfirmar.textContent = 'Confirmando...';

    try {
      await chamarBackend('confirmarIdentificacaoManual', {
        numero_processo: numeroProcesso,
        tipo_processo: tipoProcesso,
        subtipo_pleito: subtipoPleito,
      });
      concluirIdentificacao(container.parentElement,
        'Identificação confirmada manualmente: ' + tipoProcesso + ' — ' + subtipoPleito + '.');
    } catch (erro) {
      mensagemErro.textContent = erro.message;
      botaoConfirmar.disabled = false;
      select.disabled = false;
      botaoConfirmar.textContent = 'Confirmar e prosseguir';
    }
  });

  return container;
}

/**
 * @returns {Promise<Array<{subtipo: string, tipo_processo: string}>>}
 */
async function carregarSubtipos() {
  if (SUBTIPOS_CACHEADOS) return SUBTIPOS_CACHEADOS;
  const dados = await chamarBackend('listarSubtiposPleito', {});
  SUBTIPOS_CACHEADOS = dados.subtipos;
  return SUBTIPOS_CACHEADOS;
}

/**
 * @param {HTMLElement} secao
 * @param {string} mensagem
 */
function concluirIdentificacao(secao, mensagem) {
  secao.innerHTML = '';
  const concluido = document.createElement('p');
  concluido.className = 'identificacao__concluido';
  concluido.textContent = '✅ ' + mensagem;
  const nota = document.createElement('p');
  nota.className = 'cartao-upload__ajuda';
  nota.textContent = 'As próximas etapas (checklist do processo e detecção de divergências) entram em prompts futuros.';
  secao.appendChild(concluido);
  secao.appendChild(nota);
}

/**
 * @param {string} texto
 * @returns {string}
 */
function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/**
 * @param {number} valor
 * @returns {string}
 */
function formatarMoeda(valor) {
  return 'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
