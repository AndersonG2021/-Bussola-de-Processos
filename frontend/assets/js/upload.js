/**
 * upload.js — envio de documentos de um processo (frontend/upload.html).
 *
 * Cada arquivo é enviado em uma chamada separada a chamarBackend, em
 * SEQUÊNCIA (não em paralelo, não em lote único) — evita estourar o
 * limite de tamanho de requisição do Apps Script e deixa cada arquivo
 * falhar/repetir independente dos outros (ver acaoUploadDocumento em
 * backend/Arquivo.gs).
 *
 * Depende de config.js, api.js, sessao.js, extracaoTexto.js (extrai o
 * texto do arquivo antes de enviar — Prompt 5) e identificacao.js
 * (identifica o tipo do processo ao final do lote — Prompt 6).
 */

// Mantenha em sincronia com MIMETYPES_SUPORTADOS / TAMANHO_MAXIMO_ARQUIVO_BYTES em backend/Arquivo.gs.
const MIMETYPES_SUPORTADOS = ['application/pdf', 'text/html'];
const TAMANHO_MAXIMO_BYTES = 20 * 1024 * 1024; // 20MB

document.addEventListener('DOMContentLoaded', function () {
  if (!SESSAO_VALIDA) return; // sessao.js já está redirecionando pro login
  preencherCabecalhoSessao();

  const formUpload = document.getElementById('formUpload');
  const campoNumeroProcesso = document.getElementById('campoNumeroProcesso');
  const erroNumeroProcesso = document.getElementById('erroNumeroProcesso');
  const campoArquivos = document.getElementById('campoArquivos');
  const botaoEnviar = document.getElementById('botaoEnviar');
  const listaUpload = document.getElementById('listaUpload');
  const resumoUpload = document.getElementById('resumoUpload');

  // Um item por arquivo selecionado neste envio: { arquivo, elementoLi,
  // elementoStatus, elementoBotaoRetry, situacao }.
  let itensUpload = [];

  formUpload.addEventListener('submit', function (evento) {
    evento.preventDefault();
    iniciarEnvio();
  });

  async function iniciarEnvio() {
    erroNumeroProcesso.textContent = '';
    const numeroProcesso = campoNumeroProcesso.value.trim();

    if (!numeroProcesso) {
      erroNumeroProcesso.textContent = 'Informe o número do processo.';
      return;
    }

    const arquivos = Array.from(campoArquivos.files || []);
    if (arquivos.length === 0) {
      erroNumeroProcesso.textContent = 'Selecione ao menos um arquivo.';
      return;
    }

    botaoEnviar.disabled = true;
    listaUpload.innerHTML = '';
    resumoUpload.textContent = '';

    itensUpload = arquivos.map(criarItemUpload);

    // Sequencial de propósito — ver comentário no topo do arquivo.
    for (const item of itensUpload) {
      await enviarItem(item, numeroProcesso);
    }

    // Limpa o campo de arquivos ao final do lote (sucesso ou falha).
    // Sem isso, o navegador continua mostrando os arquivos já
    // processados como "selecionados" — dá a falsa impressão de que
    // nada foi enviado e, pior, um clique em "Enviar" de novo reenvia
    // os mesmos arquivos sem necessidade. Os itens que falharam não
    // dependem mais do campo pra serem reenviados: o botão "Tentar
    // novamente" de cada um já guarda o arquivo (item.arquivo)
    // independente do que está no input.
    campoArquivos.value = '';

    atualizarResumo();
    botaoEnviar.disabled = false;
    dispararIdentificacaoSeHouveSucesso(numeroProcesso);
  }

  /**
   * Roda a identificação automática de tipo (Prompt 6) assim que pelo
   * menos um arquivo do lote tiver subido — chamada ao final do lote
   * principal e também depois de um "Tentar novamente" bem-sucedido
   * (caso esse retry seja o primeiro sucesso do lote).
   * @param {string} numeroProcesso
   */
  function dispararIdentificacaoSeHouveSucesso(numeroProcesso) {
    const houveSucesso = itensUpload.some(function (i) {
      return i.situacao === 'sucesso' || i.situacao === 'sucesso-sem-texto';
    });
    if (houveSucesso && typeof iniciarIdentificacaoTipo === 'function') {
      iniciarIdentificacaoTipo(numeroProcesso);
    }
  }

  function criarItemUpload(arquivo) {
    const li = document.createElement('li');
    li.className = 'item-upload item-upload--pendente';

    const cabecalho = document.createElement('div');
    cabecalho.className = 'item-upload__cabecalho';

    const nomeSpan = document.createElement('span');
    nomeSpan.className = 'item-upload__nome';
    nomeSpan.textContent = arquivo.name;

    const tamanhoSpan = document.createElement('span');
    tamanhoSpan.className = 'item-upload__tamanho';
    tamanhoSpan.textContent = formatarTamanho(arquivo.size);

    cabecalho.appendChild(nomeSpan);
    cabecalho.appendChild(tamanhoSpan);

    const barra = document.createElement('div');
    barra.className = 'item-upload__barra';
    const barraPreenchimento = document.createElement('div');
    barraPreenchimento.className = 'item-upload__barra-preenchimento';
    barra.appendChild(barraPreenchimento);

    const status = document.createElement('div');
    status.className = 'item-upload__status';
    status.textContent = 'Aguardando...';

    const botaoRetry = document.createElement('button');
    botaoRetry.type = 'button';
    botaoRetry.className = 'item-upload__retry';
    botaoRetry.textContent = 'Tentar novamente';
    botaoRetry.hidden = true;

    li.appendChild(cabecalho);
    li.appendChild(barra);
    li.appendChild(status);
    li.appendChild(botaoRetry);
    listaUpload.appendChild(li);

    const item = {
      arquivo: arquivo,
      elementoLi: li,
      elementoStatus: status,
      elementoBotaoRetry: botaoRetry,
      situacao: 'pendente', // pendente | enviando | sucesso | sucesso-sem-texto | erro
    };

    // Reenvia só este arquivo — os outros itens (já enviados ou ainda
    // pendentes) ficam como estão.
    botaoRetry.addEventListener('click', function () {
      const numeroProcessoAtual = campoNumeroProcesso.value.trim();
      enviarItem(item, numeroProcessoAtual).then(function () {
        atualizarResumo();
        dispararIdentificacaoSeHouveSucesso(numeroProcessoAtual);
      });
    });

    return item;
  }

  async function enviarItem(item, numeroProcesso) {
    definirSituacao(item, 'enviando', 'Enviando...');

    if (item.arquivo.size === 0) {
      definirSituacao(item, 'erro', 'Arquivo vazio (0 bytes).');
      return;
    }

    const mimetype = inferirMimetype(item.arquivo);
    if (MIMETYPES_SUPORTADOS.indexOf(mimetype) === -1) {
      definirSituacao(item, 'erro', 'Formato não suportado — só PDF e HTML são aceitos.');
      return;
    }

    if (item.arquivo.size > TAMANHO_MAXIMO_BYTES) {
      definirSituacao(item, 'erro', 'Arquivo maior que ' + formatarTamanho(TAMANHO_MAXIMO_BYTES) + '.');
      return;
    }

    try {
      // Extração de texto acontece ANTES do envio (Prompt 5) — nunca
      // bloqueia o upload do arquivo em si, mesmo se a extração falhar
      // ou o resultado ficar abaixo do limiar (extrairTexto nunca
      // rejeita a Promise, ver extracaoTexto.js).
      definirSituacao(item, 'enviando', 'Lendo texto do arquivo...');
      const resultadoExtracao = await extrairTexto(item.arquivo, mimetype);

      definirSituacao(item, 'enviando', 'Enviando...');
      const conteudoBase64 = await lerComoBase64(item.arquivo);
      const dados = await chamarBackend('uploadDocumento', {
        numero_processo: numeroProcesso,
        nome_arquivo: item.arquivo.name,
        conteudo_base64: conteudoBase64,
        mimetype: mimetype,
        texto_extraido: resultadoExtracao.texto,
      });

      const nomeSalvo = dados.renomeado
        ? 'Enviado como "' + dados.nome_arquivo + '" (já existia um arquivo com esse nome).'
        : 'Enviado.';

      if (resultadoExtracao.ok) {
        definirSituacao(item, 'sucesso', nomeSalvo);
      } else {
        definirSituacao(item, 'sucesso-sem-texto',
          nomeSalvo + ' Texto não pôde ser lido (provavelmente PDF escaneado sem OCR) — ' +
          'não vai aparecer em buscas por palavra-chave.');
      }
    } catch (erro) {
      // Cobre tanto erro de rede/timeout quanto erro de negócio devolvido
      // pelo backend (ex.: formato não suportado) — chamarBackend (api.js)
      // já normaliza os dois em erro.message legível.
      definirSituacao(item, 'erro', erro.message);
    }
  }

  function definirSituacao(item, situacao, mensagem) {
    item.situacao = situacao;
    item.elementoLi.className = 'item-upload item-upload--' + situacao;
    item.elementoStatus.textContent = mensagem;
    item.elementoBotaoRetry.hidden = situacao !== 'erro';
  }

  function atualizarResumo() {
    const total = itensUpload.length;
    const sucesso = itensUpload.filter(function (i) { return i.situacao === 'sucesso'; }).length;
    const semTexto = itensUpload.filter(function (i) { return i.situacao === 'sucesso-sem-texto'; }).length;
    const falha = itensUpload.filter(function (i) { return i.situacao === 'erro'; }).length;
    const pendente = total - sucesso - semTexto - falha;

    if (pendente > 0) {
      resumoUpload.textContent = '';
      return;
    }

    const partes = [(sucesso + semTexto) + ' de ' + total + ' arquivo(s) enviado(s) com sucesso'];
    if (semTexto > 0) {
      partes.push(semTexto + ' sem texto extraído');
    }
    if (falha > 0) {
      partes.push(falha + ' falharam (veja o motivo em cada item acima)');
    }

    resumoUpload.textContent = partes.join('; ') + '.';
  }
});

/**
 * Usa file.type quando ele já é um dos suportados; senão infere pela
 * extensão (alguns navegadores/SOs não preenchem file.type de forma
 * confiável). O backend valida os dois de novo — isto aqui só evita
 * uma chamada de rede fadada a falhar.
 * @param {File} arquivo
 * @returns {string}
 */
function inferirMimetype(arquivo) {
  if (arquivo.type === 'application/pdf' || arquivo.type === 'text/html') {
    return arquivo.type;
  }
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith('.pdf')) return 'application/pdf';
  if (nome.endsWith('.html') || nome.endsWith('.htm')) return 'text/html';
  return arquivo.type || 'application/octet-stream';
}

/**
 * @param {File} arquivo
 * @returns {Promise<string>}  conteúdo em base64 (sem o prefixo "data:...;base64,").
 */
function lerComoBase64(arquivo) {
  return new Promise(function (resolve, reject) {
    const leitor = new FileReader();
    leitor.onload = function () {
      const resultado = leitor.result;
      const virgula = resultado.indexOf(',');
      resolve(virgula === -1 ? resultado : resultado.slice(virgula + 1));
    };
    leitor.onerror = function () {
      reject(new Error('Não foi possível ler o arquivo "' + arquivo.name + '".'));
    };
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
