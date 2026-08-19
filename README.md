# Bússola de Processos

Aplicação web interna para analisar documentos de processos administrativos
(Termos Aditivos, Termos de Compromisso, Restituição de Déficit Financeiro)
por **análise de padrões/regras** (sem IA generativa) e devolver o objetivo,
o histórico e o próximo passo do processo.

## Arquitetura

| Camada              | Tecnologia                                                        |
|----------------------|--------------------------------------------------------------------|
| Frontend             | HTML/CSS/JS puro, publicado como site estático no GitHub Pages     |
| Backend              | Google Apps Script vinculado a uma planilha, exposto como Web App  |
| Banco de dados        | Google Sheets                                                      |
| Armazenamento de arquivos | Google Drive                                                  |

O frontend **nunca** acessa Sheets ou Drive diretamente. Toda leitura e
escrita passa pelo Web App do Apps Script (`doGet`/`doPost` em
[backend/Principal.gs](backend/Principal.gs)), que é o único componente com
permissão sobre a planilha e o Drive.

```
/frontend   → site estático (GitHub Pages)
/backend    → projeto Google Apps Script (gerenciado via clasp)
```

## Estrutura do repositório

```
frontend/
  index.html               tela de login
  assets/
    css/estilo.css          estilo base reaproveitado pelas telas
    js/config.js             APPS_SCRIPT_URL e constantes globais
    js/api.js                 chamarBackend() — única porta de saída para o backend
    js/login.js                lógica da tela de login (stub nesta etapa)
    img/                       (vazio por enquanto)

backend/
  appsscript.json           manifest do Apps Script (timezone America/Fortaleza)
  .clasp.json.example       modelo de config do clasp (copiar para .clasp.json)
  ESQUEMA.md                 abas da planilha (colunas) e contrato da API — ver backend/ESQUEMA.md
  Principal.gs                doGet / doPost — pontos de entrada do Web App
  Router.gs                    despacha cada `action` recebida para a função certa
  Auth.gs                       autenticação e validação de sessão (stub)
  Planilha.gs                    acesso genérico ao Google Sheets (obter/criar aba, inserir linhas)
  Seed.gs                         seedBaseDeRegras() — popula a planilha com a base de regras
  Arquivo.gs                       acesso ao Google Drive (stub)
  Utilitarios.gs                    funções auxiliares (stub)

README.md
.gitignore
```

O contrato da API (ações POST/GET, formato de request/response) e o
esquema completo de colunas de cada aba estão documentados em
[backend/ESQUEMA.md](backend/ESQUEMA.md). Fora a action `ping`
(healthcheck) e a criação/seed das abas, ainda não há regra de negócio
implementada — a tela de login segue sem autenticar ninguém.

## Rodando o frontend localmente

O frontend é 100% estático, sem build. Basta servir a pasta `frontend/`:

```bash
cd frontend
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. (Abrir o `index.html`
direto com duplo clique também funciona para conferir o layout, mas alguns
navegadores restringem `fetch` em páginas abertas via `file://` — prefira
sempre um servidor local, mesmo simples como o acima.)

Se preferir Node em vez de Python:

```bash
cd frontend
npx serve .
```

Antes do backend estar publicado, `APPS_SCRIPT_URL` em
[frontend/assets/js/config.js](frontend/assets/js/config.js) fica vazia e
qualquer chamada ao backend falha com um erro explícito — isso é esperado.

## Publicando no GitHub Pages

O GitHub Pages, no modo "Deploy from a branch", só permite publicar a partir
da **raiz** do branch ou de uma pasta **`/docs`** — não existe opção para
apontar direto para `/frontend`. Para manter a estrutura `/frontend` +
`/backend` do repositório sem precisar mover/renomear pastas, a publicação
usa um workflow do GitHub Actions
([`.github/workflows/pages.yml`](.github/workflows/pages.yml)) que empacota
só o conteúdo de `frontend/` a cada push em `main`.

1. Suba o repositório para o GitHub (branch `main`) — o workflow já vai
   junto, em `.github/workflows/pages.yml`.
2. Em **Settings → Pages**, em **Build and deployment → Source**, troque de
   `Deploy from a branch` para **`GitHub Actions`**.
3. Isso é suficiente — não precisa escolher um workflow de template; o
   `pages.yml` do repositório já roda sozinho a cada push que mexer em
   `frontend/`. Acompanhe o progresso na aba **Actions** do repositório.
4. Em alguns minutos o site fica em
   `https://<seu-usuario>.github.io/<nome-do-repo>/` — servindo o conteúdo
   de `frontend/` direto na raiz da URL (sem precisar de `/frontend/` no
   caminho).
5. Sempre que `APPS_SCRIPT_URL` mudar (novo deploy do backend), atualize
   [frontend/assets/js/config.js](frontend/assets/js/config.js) e faça
   commit/push — o workflow republica automaticamente.

> Se o repositório for privado, GitHub Pages exige plano pago do GitHub
> para publicar. Caso não tenha, deixe o repositório público (o frontend
> não deve conter nenhuma credencial — só HTML/CSS/JS público).

## Roteiro manual (fora do Claude Code)

Estas etapas exigem login interativo na sua conta Google e não podem ser
automatizadas por aqui. Faça nesta ordem:

### 1. Criar a planilha Google Sheets

- Crie uma planilha nova no Google Drive (ex.: "Bússola de Processos — Dados").
- Defina as abas que o backend vai usar (ex.: `Usuarios`, `Processos`,
  `Historico`) — a estrutura exata de colunas fica para uma etapa seguinte,
  quando a lógica de negócio for implementada.
- Guarde o ID da planilha (está na URL, entre `/d/` e `/edit`).

### 2. Criar o projeto Apps Script vinculado à planilha

- Na própria planilha: **Extensões → Apps Script**. Isso cria um projeto
  Apps Script já vinculado (bound script), o que garante que
  `SpreadsheetApp.getActiveSpreadsheet()` funcione sem precisar passar o ID.
- Anote o **Script ID** do projeto (**Configurações do projeto** → "Script ID").

### 3. Instalar e autenticar o clasp

```bash
npm install -g @google/clasp
clasp login
```

Isso abre o navegador para login Google e grava as credenciais em
`~/.clasprc.json` (fora do repositório — nunca versionar, ver `.gitignore`).

Na Google Cloud, habilite a **Apps Script API** em
https://script.google.com/home/usersettings (necessário para o clasp
conseguir enviar código).

### 4. Vincular a pasta `backend/` ao projeto criado

```bash
cd backend
cp .clasp.json.example .clasp.json
```

Edite `.clasp.json` e cole o **Script ID** anotado no passo 2. Depois envie
os arquivos:

```bash
clasp push
```

(Alternativa: em vez de copiar o exemplo, rode `clasp clone <SCRIPT_ID>`
dentro de `backend/` — ele já cria o `.clasp.json` correto e baixa o que
existir no projeto.)

### 5. Publicar o Web App

```bash
clasp deploy
```

Ou pela interface: no editor do Apps Script, **Implantar → Nova implantação
→ Tipo: App da Web**. Configure:

- **Executar como**: você mesmo (é quem terá permissão de escrita na planilha)
- **Quem pode acessar**: conforme a necessidade (ex.: qualquer pessoa com o
  link, se o frontend for acessado sem login Google; ou restrito ao domínio
  da organização)

Copie a **URL do Web App** gerada (termina em `/exec`) e cole em
`APPS_SCRIPT_URL` no arquivo
[frontend/assets/js/config.js](frontend/assets/js/config.js). Faça commit e
push para o GitHub Pages republicar.

> Sempre que o código do backend mudar, repita `clasp push`. Depois, para
> atualizar o Web App **sem trocar a URL** (a mesma URL fica em
> `config.js`), atualize o deployment existente em vez de criar um novo:
>
> ```bash
> clasp list-deployments        # copie o ID do deployment em uso (não o @HEAD)
> clasp deploy -i <DEPLOYMENT_ID> -d "Descrição da mudança"
> ```
>
> Só use `clasp deploy` sem `-i` (cria um deployment novo, com URL nova) se
> quiser publicar uma versão em paralelo à atual.

### Estado atual do deploy

- Projeto Apps Script vinculado à planilha, Script ID em `backend/.clasp.json`
  (arquivo local, não versionado — recrie com `clasp clone <SCRIPT_ID>` ou
  copiando `.clasp.json.example` se precisar em outra máquina).
- Web App já publicado, acesso `ANYONE_ANONYMOUS` / executa como quem
  implantou. A URL ativa está em
  [frontend/assets/js/config.js](frontend/assets/js/config.js).
- Ao testar a URL manualmente com `curl` (fora do navegador), lembre que o
  Apps Script responde com um **redirect 302** para
  `script.googleusercontent.com` antes do JSON final — isso é esperado e o
  `fetch()` do navegador (usado em `assets/js/api.js`) já lida com isso
  nativamente, sem configuração extra.
