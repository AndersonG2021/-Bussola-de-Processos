/**
 * Auth.gs — cadastro de usuário, login e validação de sessão.
 *
 * Senha: cada usuário tem um salt aleatório (Usuarios.senha_salt) e o
 * hash guardado é SHA-256(salt + senha) em hexadecimal
 * (Usuarios.senha_hash) — a senha em si nunca é persistida, logada ou
 * devolvida em nenhuma resposta. calcularHash() é a única função que
 * calcula esse hash; use-a tanto para criar quanto para conferir senha,
 * nunca duplique a lógica.
 */

/** Duração da sessão emitida no login. */
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8 horas

/**
 * Mensagem única para qualquer falha de login (usuário inexistente,
 * inativo, ou senha errada) — nunca revele qual foi o motivo real, pra
 * não dar pista de quais logins existem.
 */
const ERRO_LOGIN_GENERICO = 'Usuário ou senha inválidos.';

/**
 * Cadastra um usuário na aba Usuarios. Não há tela para isso no MVP —
 * rode manualmente no editor do Apps Script: selecione esta função no
 * dropdown ao lado de "Depuração", ajuste os parâmetros na própria
 * chamada abaixo (ou crie uma função de teste temporária que a chame) e
 * clique em Executar. Ex.:
 *
 *   function _criarPrimeiroGerente() {
 *     criarUsuario('jsilva', 'umaSenhaForteAqui', 'Gerente', 'Joana Silva');
 *   }
 *
 * @param {string} usuarioLogin  Login único (não precisa ser e-mail).
 * @param {string} senhaPlana    Senha em texto puro — só existe durante esta chamada.
 * @param {string} perfil        'Analista' ou 'Gerente'.
 * @param {string} [nome]        Nome de exibição; default = usuarioLogin.
 * @returns {string}  id do usuário criado.
 */
function criarUsuario(usuarioLogin, senhaPlana, perfil, nome) {
  if (!usuarioLogin || !senhaPlana || !perfil) {
    throw new Error('criarUsuario: usuarioLogin, senhaPlana e perfil são obrigatórios.');
  }
  if (perfil !== 'Analista' && perfil !== 'Gerente') {
    throw new Error('criarUsuario: perfil deve ser "Analista" ou "Gerente" (recebido: "' + perfil + '").');
  }
  if (buscarUsuarioPorLogin(usuarioLogin)) {
    throw new Error('criarUsuario: já existe um usuário com login "' + usuarioLogin + '".');
  }

  const salt = Utilities.getUuid();
  const hash = calcularHash(senhaPlana, salt);
  const id = Utilities.getUuid();

  const aba = obterOuCriarAba('Usuarios', ESQUEMA_ABAS.Usuarios);
  aba.appendRow([id, nome || usuarioLogin, usuarioLogin, hash, salt, perfil, true]);

  Logger.log('Usuário criado: ' + usuarioLogin + ' (' + perfil + '), id=' + id);
  return id;
}

/**
 * SHA-256(salt + senha), em hexadecimal minúsculo (64 caracteres).
 * @param {string} senhaPlana
 * @param {string} salt
 * @returns {string}
 */
function calcularHash(senhaPlana, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + senhaPlana);
  return bytes.map(function (byte) {
    const hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * @param {string} usuarioLogin
 * @returns {Object|null}  Linha de Usuarios como objeto (chaves = colunas), ou null.
 */
function buscarUsuarioPorLogin(usuarioLogin) {
  const resultado = buscarLinhaPorColuna('Usuarios', 'usuario_login', usuarioLogin);
  return resultado ? resultado.valores : null;
}

/**
 * Action "login" (pública — não exige sessão prévia, ver ACOES_PUBLICAS
 * em Router.gs). Payload esperado: { usuario, senha }.
 *
 * @param {{usuario: string, senha: string}} payload
 * @returns {{ok: boolean, data?: {token: string, perfil: string, nome: string}, erro?: string}}
 */
function acaoLogin(payload) {
  const usuarioLogin = payload && payload.usuario;
  const senhaPlana = payload && payload.senha;

  if (!usuarioLogin || !senhaPlana) {
    return { ok: false, erro: ERRO_LOGIN_GENERICO };
  }

  const usuario = buscarUsuarioPorLogin(usuarioLogin);
  if (!usuario || !usuario.ativo) {
    return { ok: false, erro: ERRO_LOGIN_GENERICO };
  }

  if (calcularHash(senhaPlana, usuario.senha_salt) !== usuario.senha_hash) {
    return { ok: false, erro: ERRO_LOGIN_GENERICO };
  }

  const token = Utilities.getUuid();
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);

  const abaSessoes = obterOuCriarAba('Sessoes', ESQUEMA_ABAS.Sessoes);
  abaSessoes.appendRow([token, usuario.id, agora.toISOString(), expiraEm.toISOString()]);

  return {
    ok: true,
    data: { token: token, perfil: usuario.perfil, nome: usuario.nome },
  };
}

/**
 * Middleware de autorização — toda action que não esteja em
 * ACOES_PUBLICAS (Router.gs) passa pelo validarSessao antes de rodar.
 *
 * @param {string} token
 * @returns {{token: string, usuarioId: string, perfil: string, nome: string}|null}
 *   null se o token não existir, estiver expirado, ou se o usuário
 *   associado não existir/estiver inativo (conta desativada depois do
 *   login não deve continuar autorizada).
 */
function validarSessao(token) {
  if (!token) return null;

  const sessao = buscarLinhaPorColuna('Sessoes', 'token', token);
  if (!sessao) return null;

  const expiraEm = new Date(sessao.valores.expira_em);
  if (isNaN(expiraEm.getTime()) || expiraEm.getTime() <= Date.now()) {
    return null;
  }

  const usuario = buscarLinhaPorColuna('Usuarios', 'id', sessao.valores.usuario_id);
  if (!usuario || !usuario.valores.ativo) return null;

  return {
    token: token,
    usuarioId: sessao.valores.usuario_id,
    perfil: usuario.valores.perfil,
    nome: usuario.valores.nome,
  };
}

/**
 * Action protegida "meuPerfil" — devolve os dados da própria sessão.
 * Serve pro frontend confirmar que o token ainda é válido (ex.: ao
 * reabrir uma tela) e é o exemplo mínimo de action protegida: qualquer
 * outra action que precisar de sessão segue o mesmo formato
 * (payload, sessao) => {...}, registrada em ACOES_POST no Router.gs.
 * @param {Object} payload  Não usado.
 * @param {{token: string, usuarioId: string, perfil: string, nome: string}} sessao
 */
function acaoMeuPerfil(payload, sessao) {
  return { ok: true, data: { perfil: sessao.perfil, nome: sessao.nome } };
}
