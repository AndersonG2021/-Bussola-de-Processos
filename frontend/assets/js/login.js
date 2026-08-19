/**
 * login.js — tela de login (frontend/index.html).
 *
 * Depende de config.js e api.js (chamarBackend, salvarSessao, obterSessao).
 */

// Se já existe uma sessão válida nesta aba, pula direto pra tela
// principal em vez de mostrar o formulário de novo.
if (obterSessao() && obterSessao().token) {
  window.location.href = 'principal.html';
}

const formLogin = document.getElementById('formLogin');
const campoUsuario = document.getElementById('campoUsuario');
const campoSenha = document.getElementById('campoSenha');
const botaoEntrar = document.getElementById('botaoEntrar');
const mensagemErro = document.getElementById('mensagemErro');

formLogin.addEventListener('submit', async function (evento) {
  evento.preventDefault();
  esconderErro();

  const usuario = campoUsuario.value.trim();
  const senha = campoSenha.value;

  if (!usuario || !senha) {
    mostrarErro('Preencha usuário e senha.');
    return;
  }

  botaoEntrar.disabled = true;
  botaoEntrar.textContent = 'Entrando...';

  try {
    const dados = await chamarBackend('login', { usuario: usuario, senha: senha });
    salvarSessao({ token: dados.token, perfil: dados.perfil, nome: dados.nome });
    window.location.href = 'principal.html';
    // Não reabilita o botão nem limpa a senha aqui de propósito: a
    // navegação já está a caminho.
  } catch (erro) {
    mostrarErro(erro.message);
    // Limpa só a senha (não o usuário) para tentar de novo sem
    // deixar o valor antigo parado no campo/DOM por mais tempo que o
    // necessário.
    campoSenha.value = '';
    botaoEntrar.disabled = false;
    botaoEntrar.textContent = 'Entrar';
  }
});

function mostrarErro(texto) {
  mensagemErro.textContent = texto;
  mensagemErro.classList.add('visivel');
}

function esconderErro() {
  mensagemErro.textContent = '';
  mensagemErro.classList.remove('visivel');
}
