/**
 * Arquivo.gs — upload de documentos do processo para o Google Drive.
 *
 * Estrutura no Drive: NOME_PASTA_RAIZ / NOME_SUBPASTA_PROCESSOS /
 * <numero_processo> — ex.: "Bússola de Processos — Documentos" /
 * "Processos" / "45". O id da subpasta do processo fica salvo em
 * Processos.drive_folder_id.
 *
 * Nome de arquivo duplicado (mesmo numero_processo + nome_arquivo já
 * registrado em DocumentosProcesso) → DECISÃO: VERSIONA, não
 * sobrescreve. O arquivo novo entra com " (v2)", " (v3)"... no nome
 * (no Drive e em DocumentosProcesso.nome_arquivo); os anteriores
 * continuam intactos. Motivo: num processo administrativo o histórico
 * importa para auditoria — sobrescrever silenciosamente perderia a
 * versão anterior, e um nome de arquivo um pouco mais longo é um preço
 * pequeno por isso.
 *
 * Sobre buscar pasta/arquivo por NOME no Drive: a indexação de busca
 * do Drive tem atraso (não é instantânea após criar) — buscar por
 * nome a cada upload já causou pasta duplicada em uploads seguidos
 * rápido pro mesmo processo. Por isso a pasta raiz/Processos fica em
 * cache nas Propriedades do Script (id, não nome) e a pasta de cada
 * processo é resolvida pelo drive_folder_id já salvo em Processos
 * (leitura de planilha é sempre consistente) sempre que possível —
 * busca por nome só acontece na primeira vez que cada pasta existe.
 */

/** Pasta no Drive que guarda tudo do app. */
const NOME_PASTA_RAIZ = 'Bússola de Processos — Documentos';

/** Subpasta, dentro da raiz, que guarda uma pasta por processo. */
const NOME_SUBPASTA_PROCESSOS = 'Processos';

/** Chave nas Propriedades do Script onde fica o id da pasta "Processos" (cache). */
const PROPRIEDADE_ID_PASTA_PROCESSOS = 'PASTA_PROCESSOS_ID';

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
 * Pasta "Processos" dentro da pasta raiz do app — cria as duas se
 * ainda não existirem. O id da pasta "Processos" fica em cache nas
 * Propriedades do Script (PROPRIEDADE_ID_PASTA_PROCESSOS) pra não
 * depender de busca por nome no Drive em toda chamada (ver comentário
 * no topo do arquivo sobre atraso de indexação).
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterPastaProcessosRaiz() {
  const propriedades = PropertiesService.getScriptProperties();
  const idCacheado = propriedades.getProperty(PROPRIEDADE_ID_PASTA_PROCESSOS);

  if (idCacheado) {
    try {
      return DriveApp.getFolderById(idCacheado);
    } catch (erroPastaSumiu) {
      // A pasta foi apagada/movida manualmente fora do app — recria abaixo.
    }
  }

  // Lock evita duas execuções quase simultâneas criando a pasta raiz em
  // duplicidade — só importa na toda primeira vez, antes do id ficar
  // em cache.
  const bloqueio = LockService.getScriptLock();
  bloqueio.waitLock(30000);
  try {
    const idCriadoEnquantoEsperava = propriedades.getProperty(PROPRIEDADE_ID_PASTA_PROCESSOS);
    if (idCriadoEnquantoEsperava) {
      return DriveApp.getFolderById(idCriadoEnquantoEsperava);
    }

    const pastaRaiz = obterOuCriarPastaFilha(DriveApp, NOME_PASTA_RAIZ);
    const pastaProcessos = obterOuCriarPastaFilha(pastaRaiz, NOME_SUBPASTA_PROCESSOS);
    propriedades.setProperty(PROPRIEDADE_ID_PASTA_PROCESSOS, pastaProcessos.getId());
    return pastaProcessos;
  } finally {
    bloqueio.releaseLock();
  }
}

/**
 * @param {GoogleAppsScript.Drive.Folder|GoogleAppsScript.Drive.DriveApp} pai
 * @param {string} nome
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterOuCriarPastaFilha(pai, nome) {
  const pastas = pai.getFoldersByName(nome);
  if (pastas.hasNext()) return pastas.next();
  return pai.createFolder(nome);
}

/**
 * Pasta do processo dentro de NOME_SUBPASTA_PROCESSOS. Se o processo
 * já tiver um drive_folder_id salvo em Processos, usa ele direto
 * (busca por id, sempre confiável) em vez de buscar por nome no Drive
 * — só faz busca por nome (e cria, se não achar) na primeira vez que
 * um numero_processo aparece.
 * @param {string} numeroProcesso
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function obterOuCriarPastaProcesso(numeroProcesso) {
  const processoExistente = buscarLinhaPorColuna('Processos', 'numero_processo', numeroProcesso);
  if (processoExistente && processoExistente.valores.drive_folder_id) {
    try {
      return DriveApp.getFolderById(processoExistente.valores.drive_folder_id);
    } catch (erroPastaSumiu) {
      // A pasta foi apagada/movida manualmente fora do app — recria abaixo.
    }
  }

  const pastaProcessos = obterPastaProcessosRaiz();
  return obterOuCriarPastaFilha(pastaProcessos, numeroProcesso);
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

  // String(...) dos dois lados de propósito — mesmo motivo do
  // buscarLinhaPorColuna (Planilha.gs): o Sheets converte
  // numero_processo "que parece número" pra número de verdade na
  // célula, então comparar sem normalizar nunca bate.
  const numeroProcessoComparavel = String(numeroProcesso);
  const nomesExistentes = new Set();
  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][idxProcesso]) === numeroProcessoComparavel) {
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
