/**
 * sessao.js — proteção de tela para páginas que exigem login.
 *
 * Inclua este script em qualquer página protegida, DEPOIS de config.js
 * e api.js. Ele expõe:
 *   - SESSAO_ATUAL: os dados da sessão salva (token, perfil, nome), ou
 *     null se não houver nenhuma.
 *   - SESSAO_VALIDA: true se SESSAO_ATUAL existir e tiver token.
 *   - sair(): limpa a sessão e volta pro login.
 *
 * Essa checagem é só de PRESENÇA do token em sessionStorage — evita
 * desenhar a tela por uma fração de segundo antes de redirecionar.
 * A validade de verdade (token existe? não expirou?) é sempre
 * conferida pelo backend a cada chamada; se ele responder
 * codigo "SESSAO_INVALIDA", chamarBackend (api.js) já desloga e
 * redireciona sozinho, então nenhuma tela protegida precisa tratar
 * "sessão expirou no meio do uso" na mão.
 *
 * Scripts que rodam depois deste (ex.: principal.js) devem checar
 * `if (!SESSAO_VALIDA) return;` no início de qualquer handler que
 * dependa de SESSAO_ATUAL — o redirecionamento abaixo é assíncrono
 * (não interrompe a execução do resto da página na hora).
 */

const SESSAO_ATUAL = obterSessao();
const SESSAO_VALIDA = !!(SESSAO_ATUAL && SESSAO_ATUAL.token);

if (!SESSAO_VALIDA) {
  redirecionarParaLogin();
}

/** Desloga e volta pro login. */
function sair() {
  limparSessao();
  redirecionarParaLogin();
}

/**
 * Preenche o cabeçalho padrão de tela protegida (nome/perfil da sessão
 * e o botão Sair), se os elementos existirem na página. Chame depois
 * que o DOM estiver pronto, em toda tela que reusa o `.cabecalho` do
 * estilo.css com #nomeUsuario/#perfilUsuario/#botaoSair.
 */
function preencherCabecalhoSessao() {
  if (!SESSAO_VALIDA) return;

  const elementoNome = document.getElementById('nomeUsuario');
  const elementoPerfil = document.getElementById('perfilUsuario');
  const elementoBotaoSair = document.getElementById('botaoSair');

  if (elementoNome) elementoNome.textContent = SESSAO_ATUAL.nome || '';
  if (elementoPerfil) elementoPerfil.textContent = SESSAO_ATUAL.perfil || '';
  if (elementoBotaoSair) elementoBotaoSair.addEventListener('click', sair);
}
