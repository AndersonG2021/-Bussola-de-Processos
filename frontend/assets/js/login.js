/**
 * Tela de login — STUB.
 *
 * Nesta etapa o formulário ainda não autentica ninguém: a lógica real
 * (chamada a chamarBackend('login', {...}), tratamento de resposta e
 * redirecionamento) entra em uma etapa futura, junto com o Auth.gs
 * do backend. Por ora só evitamos o reload da página e sinalizamos
 * visualmente que a função ainda não está disponível.
 */
document.getElementById('formLogin').addEventListener('submit', function (evento) {
  evento.preventDefault();

  const mensagemErro = document.getElementById('mensagemErro');
  mensagemErro.textContent = 'Login ainda não implementado nesta etapa do projeto.';
  mensagemErro.classList.add('visivel');
});
