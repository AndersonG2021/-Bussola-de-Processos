/**
 * Arquivo.gs — upload de documentos do processo para o Google Drive.
 *
 * Estrutura no Drive: uma pasta raiz (NOME_PASTA_RAIZ) contendo uma
 * subpasta por processo, nomeada com o número do processo. O id dessa
 * subpasta fica salvo em Processos.drive_folder_id.
 *
 * Nome de arquivo duplicado (mesmo numero_processo + nome_arquivo já
 * registrado em DocumentosProcesso) → DECISÃO: VERSIONA, não
 * sobrescreve. O arquivo novo entra com " (v2)", " (v3)"... no nome
 * (no Drive e em DocumentosProcesso.nome_arquivo); os anteriores
 * continuam intactos. Motivo: num processo administrativo o histórico
 * importa para auditoria — sobrescrever silenciosamente perderia a
 * versão anterior, e um nome de arquivo um pouco mais longo é um preço
 * pequeno por isso.
 */

/** Pasta no Drive que guarda todas as pastas de processo do app. */
const NOME_PASTA_RAIZ = 'Bússola de Processos — Documentos';

/** Mimetypes aceitos no upload — mantenha em sincronia com assets/js/upload.js no frontend. */
const MIMETYPES_SUPORTADOS = ['application/pdf', 'text/html'];

/** Tamanho máximo aceito por arquivo (ver orientação de ~15-20MB do Prompt 4). */
const TAMANHO_MAXIMO_ARQUIVO_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * Action "uploadDocumento" (protegida — exige sessão válida). Payload:
 * { numero_processo, nome_arquivo, conteudo_base64, mimetype }.
 *
 * @param {{numero_processo: string, nome_arquivo: string, conteudo_base64: string, mimetype: string}} payload
 * @param {{token: string, usuarioId: string, perfil: string, nome: string}} sessao
 * @returns {{ok: boolean, data?: Object, erro?: string, codigo?: string}}
 */
function acaoUploadDocumento(payload, sessao) {
  const numeroProcesso = String((payload && payload.numero_processo) || '').trim();
  const nomeArquivo = String((payload && payload.nome_arquivo) || '').trim();
  const conteudoBase64 = payload && payload.conteudo_base64;
  const mimetype = payload && payload.mimetype;

  if (!numeroProcesso) {
    return { ok: false, erro: 'Número do processo é obrigatório.', codigo: 'PROCESSO_VAZIO' };
  }
  if (!nomeArquivo) {
    return { ok: false, erro: 'Nome do arquivo é obrigatório.', codigo: 'ARQUIVO_INVALIDO' };
  }
  if (!conteudoBase64) {
    return { ok: false, erro: 'Arquivo vazio (0 bytes) não pode ser enviado.', codigo: 'ARQUIVO_VAZIO' };
  }
  if (MIMETYPES_SUPORTADOS.indexOf(mimetype) === -1 || !extensaoCondizComMimetype(nomeArquivo, mimetype)) {
    return { ok: false, erro: 'Formato não suportado — só PDF e HTML são aceitos.', codigo: 'FORMATO_NAO_SUPORTADO' };
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(conteudoBase64);
  } catch (erroDecode) {
    return { ok: false, erro: 'Conteúdo do arquivo não é base64 válido.', codigo: 'ARQUIVO_INVALIDO' };
  }
  if (!bytes || bytes.length === 0) {
    return { ok: false, erro: 'Arquivo vazio (0 bytes) não pode ser enviado.', codigo: 'ARQUIVO_VAZIO' };
  }
  if (bytes.length > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
    return {
      ok: false,
      erro: 'Arquivo maior que ' + (TAMANHO_MAXIMO_ARQUIVO_BYTES / (1024 * 1024)) + 'MB.',
      codigo: 'ARQUIVO_MUITO_GRANDE',
    };
  }

  // Garante as abas antes de usar (idempotente — não mexe se já existirem certas).
  obterOuCriarAba('DocumentosProcesso', ESQUEMA_ABAS.DocumentosProcesso);
  obterOuCriarAba('Processos', ESQUEMA_ABAS.Processos);

  const pastaProcesso = obterOuCriarPastaProcesso(numeroProcesso);
  const nomeFinal = proximoNomeDisponivel(numeroProcesso, nomeArquivo);
  const driveFileId = salvarArquivoNoDrive(pastaProcesso, nomeFinal, bytes, mimetype);
  const hashConteudo = calcularHashBytes(bytes);
  const idDocumento = Utilities.getUuid();

  inserirLinha('DocumentosProcesso', {
    id_documento: idDocumento,
    numero_processo: numeroProcesso,
    nome_arquivo: nomeFinal,
    drive_file_id: driveFileId,
    texto_extraido_ok: false, // extração de texto entra num prompt futuro
    hash_conteudo: hashConteudo,
  });

  garantirProcesso(numeroProcesso, pastaProcesso.getId());

  return {
    ok: true,
    data: {
      id_documento: idDocumento,
      nome_arquivo: nomeFinal,
      drive_file_id: driveFileId,
      renomeado: nomeFinal !== nomeArquivo,
    },
  };
}

/**
 * Confere se a extensão do nome do arquivo é compatível com o
 * mimetype declarado — defesa extra além da lista MIMETYPES_SUPORTADOS
 * (dificulta um mimetype "application/pdf" forjado num arquivo .exe
 * renomeado, por exemplo).
 * @param {string} nomeArquivo
 * @param {string} mimetype
 * @returns {boolean}
 */
function extensaoCondizComMimetype(nomeArquivo, mimetype) {
  const nomeMinusculo = nomeArquivo.toLowerCase();
  if (mimetype === 'application/pdf') return nomeMinusculo.endsWith('.pdf');
  if (mimetype === 'text/html') return nomeMinusculo.endsWith('.html') || nomeMinusculo.endsWith('.htm');
  return false;
}

/**
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterPastaRaiz() {
  const pastas = DriveApp.getFoldersByName(NOME_PASTA_RAIZ);
  if (pastas.hasNext()) return pastas.next();
  return DriveApp.createFolder(NOME_PASTA_RAIZ);
}

/**
 * @param {string} numeroProcesso
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterOuCriarPastaProcesso(numeroProcesso) {
  const pastaRaiz = obterPastaRaiz();
  const pastas = pastaRaiz.getFoldersByName(numeroProcesso);
  if (pastas.hasNext()) return pastas.next();
  return pastaRaiz.createFolder(numeroProcesso);
}

/**
 * @param {GoogleAppsScript.Drive.Folder} pasta
 * @param {string} nomeArquivo
 * @param {number[]} bytes
 * @param {string} mimetype
 * @returns {string}  drive_file_id do arquivo criado.
 */
function salvarArquivoNoDrive(pasta, nomeArquivo, bytes, mimetype) {
  const blob = Utilities.newBlob(bytes, mimetype, nomeArquivo);
  return pasta.createFile(blob).getId();
}

/**
 * SHA-256 do conteúdo do arquivo, em hex — usado para detectar o que
 * mudou numa reanálise (ver DocumentosProcesso.hash_conteudo em
 * ESQUEMA.md). Sem salt: isto não é senha, é impressão digital de
 * conteúdo, não precisa ser resistente à mesma ameaça.
 * @param {number[]} bytes
 * @returns {string}
 */
function calcularHashBytes(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return bytesParaHex(digest);
}

/**
 * Se nome_arquivo já existir para esse numero_processo em
 * DocumentosProcesso, devolve um nome versionado (" (v2)", " (v3)"...
 * — o primeiro número livre). Senão devolve o nome original sem
 * mudança. Ver decisão de versionamento no cabeçalho deste arquivo.
 * @param {string} numeroProcesso
 * @param {string} nomeArquivoOriginal
 * @returns {string}
 */
function proximoNomeDisponivel(numeroProcesso, nomeArquivoOriginal) {
  const aba = obterOuCriarAba('DocumentosProcesso', ESQUEMA_ABAS.DocumentosProcesso);
  const dados = aba.getDataRange().getValues();
  const cabecalho = dados[0];
  const idxProcesso = cabecalho.indexOf('numero_processo');
  const idxNome = cabecalho.indexOf('nome_arquivo');

  const nomesExistentes = new Set();
  for (let i = 1; i < dados.length; i++) {
    if (dados[i][idxProcesso] === numeroProcesso) {
      nomesExistentes.add(dados[i][idxNome]);
    }
  }

  if (!nomesExistentes.has(nomeArquivoOriginal)) {
    return nomeArquivoOriginal;
  }

  const pontoIndice = nomeArquivoOriginal.lastIndexOf('.');
  const base = pontoIndice > 0 ? nomeArquivoOriginal.slice(0, pontoIndice) : nomeArquivoOriginal;
  const extensao = pontoIndice > 0 ? nomeArquivoOriginal.slice(pontoIndice) : '';

  let versao = 2;
  let candidato;
  do {
    candidato = base + ' (v' + versao + ')' + extensao;
    versao++;
  } while (nomesExistentes.has(candidato));

  return candidato;
}

/**
 * Garante que existe uma linha em Processos para numero_processo: cria
 * com status inicial "Aguardando análise" se não existir, ou só
 * atualiza atualizado_em se já existir. O upload não decide
 * tipo_processo/subtipo_pleito/etapa_atual — isso é papel da análise
 * de padrões, que entra num prompt futuro.
 * @param {string} numeroProcesso
 * @param {string} driveFolderId
 */
function garantirProcesso(numeroProcesso, driveFolderId) {
  const existente = buscarLinhaPorColuna('Processos', 'numero_processo', numeroProcesso);
  const agora = new Date().toISOString();

  if (existente) {
    atualizarLinha('Processos', existente.linha, { atualizado_em: agora });
    return;
  }

  inserirLinha('Processos', {
    numero_processo: numeroProcesso,
    tipo_processo: '',
    subtipo_pleito: '',
    etapa_atual: '',
    status: 'Aguardando análise',
    drive_folder_id: driveFolderId,
    criado_em: agora,
    atualizado_em: agora,
  });
}
