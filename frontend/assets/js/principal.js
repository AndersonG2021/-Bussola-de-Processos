/**
 * principal.js — tela principal (placeholder), frontend/principal.html.
 *
 * Depende de config.js, api.js e sessao.js (SESSAO_ATUAL, SESSAO_VALIDA, sair()).
 */

document.addEventListener('DOMContentLoaded', function () {
  // sessao.js já disparou o redirecionamento pro login; ele só não é
  // instantâneo, então não segue renderizando nada que dependa da sessão.
  if (!SESSAO_VALIDA) return;

  document.getElementById('nomeUsuario').textContent = SESSAO_ATUAL.nome || '';
  document.getElementById('perfilUsuario').textContent = SESSAO_ATUAL.perfil || '';

  // Esconde qualquer item de menu marcado como exclusivo de Gerente
  // quando o perfil da sessão não for Gerente.
  if (SESSAO_ATUAL.perfil !== 'Gerente') {
    document.querySelectorAll('[data-somente-gerente]').forEach(function (elemento) {
      elemento.style.display = 'none';
    });
  }

  document.getElementById('botaoSair').addEventListener('click', sair);
});
