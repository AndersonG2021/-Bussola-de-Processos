# Esquema de dados e contrato da API — Bússola de Processos

Este documento é a fonte de verdade sobre a estrutura da planilha (banco
de dados) e sobre o contrato da API exposta pelo Web App. O código que
implementa a criação/seed das abas está em
[Seed.gs](Seed.gs) (constante `ESQUEMA_ABAS` + função `seedBaseDeRegras()`);
o roteamento da API está em [Router.gs](Router.gs) e [Principal.gs](Principal.gs).

## Índice

- [Abas da planilha](#abas-da-planilha)
- [Rodando o seed](#rodando-o-seed)
- [Pendências de dados](#pendências-de-dados)
- [Contrato da API](#contrato-da-api)
- [Por que `text/plain` em vez de `application/json`](#por-que-textplain-em-vez-de-applicationjson)
- [TextoUtils.gs — utilitários de texto](#textoutilsgs--utilitários-de-texto)

## Abas da planilha

### Usuarios

Contas que conseguem logar no app.

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `id` | texto/número | Identificador único do usuário. |
| `nome` | texto | Nome de exibição. |
| `usuario_login` | texto | Login (não é o e-mail necessariamente). |
| `senha_hash` | texto | Hash da senha — **nunca** a senha em texto puro. |
| `senha_salt` | texto | Salt usado no hash. |
| `perfil` | texto | `Analista` ou `Gerente`. |
| `ativo` | booleano | `TRUE`/`FALSE` — permite desativar sem apagar o usuário. |

### Sessoes

Tokens de sessão emitidos no login.

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `token` | texto | Enviado pelo frontend em toda chamada (`chamarBackend`). |
| `usuario_id` | texto/número | Referencia `Usuarios.id`. |
| `criado_em` | datetime ISO | |
| `expira_em` | datetime ISO | Backend deve invalidar tokens expirados. |

### Processos

Um registro por processo administrativo analisado.

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `numero_processo` | texto | Chave natural do processo. |
| `tipo_processo` | texto | Referencia `TiposProcesso.nome_tipo`. |
| `subtipo_pleito` | texto | Referencia `SubtiposPleito.subtipo` (quando aplicável). |
| `etapa_atual` | texto | Nome da etapa identificada na última análise. |
| `status` | texto | Ex.: em andamento, concluído, pendente. |
| `drive_folder_id` | texto | Pasta no Drive com os documentos do processo. |
| `criado_em` | datetime ISO | |
| `atualizado_em` | datetime ISO | |

A linha é criada automaticamente no primeiro upload de documento do
processo (`garantirProcesso`, em [Arquivo.gs](Arquivo.gs)), com
`status = "Aguardando análise"` e `tipo_processo`/`subtipo_pleito`/
`etapa_atual` em branco — quem preenche esses três é a análise de
padrões (prompt futuro), não o upload.

### AnalisesHistorico

Cada execução da análise de padrões sobre um processo gera uma linha aqui
(histórico completo, não sobrescreve).

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `id_analise` | texto/número | Identificador único da análise. |
| `numero_processo` | texto | Referencia `Processos.numero_processo`. |
| `versao` | número | Incrementa a cada reanálise do mesmo processo. |
| `analisado_por` | texto | Referencia `Usuarios.id` (ou "sistema"). |
| `data_analise` | datetime ISO | |
| `tipo_identificado` | texto | Tipo de processo que a análise concluiu. |
| `confianca` | número (0–1) | Confiança da classificação por padrões. |
| `etapa_identificada` | texto | Etapa do checklist identificada. |
| `divergencias_json` | texto (JSON) | Lista de divergências encontradas, serializada. |
| `sintese_objetivo` | texto | Texto gerado: objetivo do processo. |
| `sintese_historico` | texto | Texto gerado: histórico do processo. |
| `sintese_proximo_passo` | texto | Texto gerado: próximo passo. |

### DocumentosProcesso

Metadados dos arquivos do processo (o conteúdo fica no Drive).

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `id_documento` | texto/número | |
| `numero_processo` | texto | Referencia `Processos.numero_processo`. |
| `nome_arquivo` | texto | |
| `drive_file_id` | texto | ID do arquivo no Google Drive. |
| `texto_extraido_ok` | booleano | `TRUE` se o texto extraído passou do limiar mínimo (ver abaixo). |
| `hash_conteudo` | texto | Hash do conteúdo do arquivo original — permite detectar o que mudou numa reanálise sem reprocessar tudo. |
| `texto_extraido_drive_file_id` | texto | ID do `.txt` irmão no Drive com o texto extraído. Vazio se `texto_extraido_ok = FALSE`. |
| `hash_texto_extraido` | texto | Hash do texto extraído (não do arquivo original). Vazio se `texto_extraido_ok = FALSE`. |

Preenchida pela action `uploadDocumento` (ver [Contrato da API](#contrato-da-api)).
`hash_conteudo` é um SHA-256 simples do conteúdo do arquivo original
(sem salt — não é senha, é impressão digital de conteúdo).

#### Texto extraído dos documentos (Prompt 5)

A extração de texto acontece **no navegador**, não no backend — decisão
de arquitetura do Prompt 5: o Apps Script não tem uma API boa pra
processar PDF, e extrair no servidor arriscaria estourar o limite de 6
minutos de execução dele. `frontend/assets/js/extracaoTexto.js` usa a
biblioteca [pdf.js](https://mozilla.github.io/pdf.js/) (carregada via
CDN, versão fixa `3.11.174`) para PDF, e `DOMParser` + `textContent`
nativos do navegador para HTML. O texto extraído vai junto no payload
de `uploadDocumento` (campo opcional `texto_extraido`).

**Onde o texto extraído fica salvo — DECISÃO: arquivo `.txt` irmão no
Drive, não uma coluna da planilha.** Uma célula do Google Sheets tem um
limite rígido de 50.000 caracteres; um documento administrativo de
várias páginas facilmente passa disso, e um estouro silencioso
truncaria o texto sem aviso — inaceitável pra uma engine de busca por
palavra-chave. Guardando num arquivo `.txt` (nome:
`<nome_arquivo_final>.txt`, mesma pasta do documento original) não há
esse limite, e o custo de consultar depois é só mais uma chamada
`DriveApp.getFileById(id).getBlob().getDataAsString()` — pequeno frente
ao risco de truncamento.

**Limiar de "texto não pôde ser lido":** menos de `30` caracteres
(depois de `trim`) — sinal de PDF escaneado sem camada de texto (só
imagem, sem OCR). Constante `LIMIAR_TEXTO_EXTRAIDO_CARACTERES`,
duplicada em `frontend/assets/js/extracaoTexto.js` (decide o que
mostrar no resumo do upload) e `backend/Arquivo.gs` (reconfere de
novo — mesmo padrão de "valide de novo no backend" do resto do app,
não confia cegamente no que o frontend calculou). Um arquivo com texto
abaixo do limiar **ainda é enviado normalmente** — só fica com
`texto_extraido_ok = FALSE`, sem `.txt` irmão nem `hash_texto_extraido`;
o upload da Funcionalidade 2 não é bloqueado por isso, só sinaliza no
resumo.

**Limitação conhecida:** pdf.js extrai o texto mas perde a estrutura de
tabela — cotações, mapas de cotação e outras tabelas viram texto
corrido, sem separação de coluna. Isso pode prejudicar a precisão da
Funcionalidade 5 (detecção de divergências) mais adiante. Aceitável
pro MVP; vale revisar se a precisão de detecção ficar abaixo do
esperado.

**Arquivo com o mesmo nome no mesmo processo → VERSIONA, não
sobrescreve.** Um novo upload de `nome_arquivo` já existente para aquele
`numero_processo` entra como uma linha nova, com o nome ajustado para
`nome (v2).ext`, `nome (v3).ext`... (primeiro número livre) — tanto na
planilha quanto no arquivo salvo no Drive. As versões anteriores
continuam intactas, sem serem apagadas ou substituídas. Decisão: num
processo administrativo o histórico importa para auditoria — perder a
versão anterior silenciosamente seria pior que um nome de arquivo um
pouco mais longo. Implementado em `proximoNomeDisponivel`
([Arquivo.gs](Arquivo.gs)).

**Estrutura no Drive:** `Bússola de Processos — Documentos` /
`Processos` / `<numero_processo>` — o id dessa última pasta é o
`Processos.drive_folder_id`. O id da pasta `Processos` fica em cache
nas Propriedades do Script (não é buscado por nome no Drive a cada
upload — ver nota abaixo sobre por quê).

> **Nota sobre buscar por nome no Drive:** a indexação de busca do
> Drive tem atraso — uma pasta recém-criada pode não aparecer numa
> busca por nome feita logo em seguida. Isso já causou pasta duplicada
> em uploads seguidos rápido pro mesmo processo. A correção:
> `obterPastaProcessosRaiz` ([Arquivo.gs](Arquivo.gs)) guarda o id da
> pasta `Processos` nas Propriedades do Script assim que ela é criada
> (com `LockService` pra evitar duas criações simultâneas), e
> `obterOuCriarPastaProcesso` usa o `drive_folder_id` já salvo em
> `Processos` (busca por id, sempre confiável) em vez de buscar por
> nome sempre que o processo já é conhecido — a busca por nome só
> acontece mesmo na primeira vez que cada pasta é criada.
>
> **Nota sobre `numero_processo` "parecer número":** o Google Sheets
> converte sozinho uma string que parece número (ex.: `"45"`) pra
> número de verdade ao salvar a célula. Comparar com `===` puro contra
> o valor recebido na requisição (que é sempre string) nunca bate — foi
> a causa de uploads duplicados não serem detectados/versionados.
> `buscarLinhaPorColuna` ([Planilha.gs](Planilha.gs)) e a checagem de
> duplicata em `proximoNomeDisponivel` ([Arquivo.gs](Arquivo.gs))
> convertem os dois lados pra `String(...)` antes de comparar,
> exatamente por causa disso.

### TiposProcesso

Catálogo dos tipos de processo suportados.

| Coluna | Tipo/formato |
|---|---|
| `nome_tipo` | texto |
| `descricao` | texto |

Seed atual: `Termo Aditivo`, `Termo de Compromisso`, `Restituição de
Déficit Financeiro`.

### SubtiposPleito

Mapeia cada subtipo de pleito ao tipo de processo e ao checklist que ele usa.

| Coluna | Tipo/formato |
|---|---|
| `subtipo` | texto |
| `tipo_processo` | texto — referencia `TiposProcesso.nome_tipo` |
| `checklist_associado` | texto — nome da aba de checklist, ou `"a confirmar"` |

Seed atual: 24 subtipos de **Termo Aditivo** (→ `ChecklistTA`) + 2 de
**Termo de Compromisso** (→ `ChecklistTC`, ainda vazio). Fonte: os 8
primeiros vieram do Prompt 2; os demais, da tabela "TIPO DO
PROCESSO/INSTRUÇÃO" do arquivo `Fluxo dos Termos Aditivos (Antigo).odt`
— só as linhas categorizadas como "Termo Aditivo" ou "TC" entraram; as
categorizadas como "Diverso" ou "Seleção" ficaram de fora por não
pertencerem aos 3 tipos de processo deste app. A lista completa está em
`SUBTIPOS_PLEITO` em [Seed.gs](Seed.gs).

Duas duplas quase-sinônimas foram mantidas como itens distintos (o
documento-fonte as lista separadamente) — revisar se são o mesmo
subtipo ou não: `Obras` (Prompt 2) vs `Obra` (documento), e
`Repactuação Financeira` (Prompt 2) vs `Repactuação Financeira (Meta)`
(documento).

### ChecklistTA, ChecklistRestituicao, ChecklistTC

As três seguem o mesmo formato de coluna — uma linha por etapa do fluxo.

| Coluna | Tipo/formato | Observações |
|---|---|---|
| `etapa_ordem` | número | Posição da etapa no fluxo. |
| `nome_etapa` | texto | |
| `documentos_esperados` | texto | Lista (texto livre ou separado por `;`) dos documentos esperados nessa etapa. |
| `palavras_chave` | texto | Termos usados pela análise de padrões para reconhecer a etapa no documento. |
| `setor_responsavel` | texto | Referencia `AtribuicoesSetor.sigla`. |
| `obrigatorio` | booleano | Se a etapa é obrigatória no fluxo. |

- **ChecklistTA**: as 13 macro-etapas do fluxo genérico de Termo Aditivo
  (seções 1–13 de `Fluxo dos Termos Aditivos (Antigo).odt` — a seção 0,
  anterior à abertura do pleito, não conta como etapa). As etapas 9–13
  vêm com `obrigatorio = FALSE`: são boas práticas, exceções ou material
  de referência/apoio, não passos sequenciais obrigatórios do trâmite.
  Dados em `ETAPAS_TERMO_ADITIVO`, [Seed.gs](Seed.gs).
- **ChecklistRestituicao**: 8 etapas do fluxo de Restituição de Déficit
  Financeiro. O documento-fonte só numera 5 seções (17 itens no total);
  as 8 etapas são um agrupamento desses itens em blocos coerentes,
  confirmado com o usuário antes de popular a planilha. Dados em
  `ETAPAS_RESTITUICAO_DEFICIT`, [Seed.gs](Seed.gs).
- **ChecklistTC**: vazio de propósito. `seedBaseDeRegras()` insere uma
  linha só com `nome_etapa = "(pendente de definição pelo Gerente)"` para
  deixar isso visível na própria planilha.

### AtribuicoesSetor

Catálogo dos setores que aparecem em `setor_responsavel` nos checklists.

| Coluna | Tipo/formato |
|---|---|
| `sigla` | texto |
| `nome_setor` | texto |
| `descricao` | texto |

Seed atual: 26 setores/siglas citados no fluxo de Termo Aditivo e de
Restituição de Déficit Financeiro (`ATRIBUICOES_SETOR`, em
[Seed.gs](Seed.gs)), com `descricao` condensada a partir do texto do
documento-fonte — das tabelas de atribuições quando disponível, senão
do papel do setor descrito na narrativa do fluxo. Sete siglas (GACDE,
DGI, CMA, SEAS, NUGEP, GCON, GPOAS) aparecem no documento só como
abreviação, sem o nome por extenso — o campo `nome_setor` diz isso
explicitamente; e algumas coordenações citadas nas tabelas de
atribuições do documento (ex.: as de supervisão por macrorregião da
CTAI) ficaram de fora por não ter sigla confirmada em nenhum outro
trecho do texto.

### RegrasEspeciais

Regras de negócio parametrizáveis (evita hardcode espalhado pelo código).

| Coluna | Tipo/formato |
|---|---|
| `nome_regra` | texto (chave) |
| `valor` | número ou texto, depende da regra |
| `descricao` | texto |

Seed atual:

| nome_regra | valor | descricao |
|---|---|---|
| `teto_dispensa_ta_aquisicao_bem_custeio` | `62725.59` | Teto anual de dispensa de Termo Aditivo para aquisição de bem via custeio: até R$ 62.725,59/ano por unidade. |

## Rodando o seed

`seedBaseDeRegras()` (em [Seed.gs](Seed.gs)) cria todas as 12 abas acima
com o cabeçalho certo e popula as que já têm dados de referência
definidos. É seguro rodar mais de uma vez: cada aba só recebe as linhas
de seed se ainda estiver vazia (`inserirLinhasSeVazia`, em
[Planilha.gs](Planilha.gs)) — não duplica dados a cada execução.

Para rodar: abra o projeto no editor do Apps Script, selecione
`seedBaseDeRegras` no dropdown de funções (ao lado do botão "Depuração")
e clique em **Executar**. Na primeira vez, o Google vai pedir autorização
de escopo (é o script pedindo permissão pra ler/escrever na planilha) —
autorize com a mesma conta dona da planilha.

## Pendências de dados

- **ChecklistTC** — vazio de propósito, aguardando definição do Gerente
  (ver seção acima).
- Duas duplas quase-sinônimas em `SubtiposPleito` que podem precisar de
  revisão/unificação: `Obras` vs `Obra`, e `Repactuação Financeira` vs
  `Repactuação Financeira (Meta)` (ver seção `SubtiposPleito` acima).
- Sete siglas em `AtribuicoesSetor` sem nome por extenso confirmado no
  documento-fonte: GACDE, DGI, CMA, SEAS, NUGEP, GCON, GPOAS.
- O documento-fonte (`Fluxo dos Termos Aditivos (Antigo).odt`) também
  traz um guia de campos do sistema de cadastro de Termo Aditivo (nº
  do SEI, Grupo de Despesa, Regular/Não regular, etc.) — não é dado de
  checklist, mas é referência útil para quando a tela de registro de
  processo (`Processos`) for implementada.

## Contrato da API

O Web App expõe um único roteador de ações, sem REST — todas as
operações passam pela mesma URL, diferenciadas pelo campo `action`.

### POST (ações gerais)

```
POST {APPS_SCRIPT_URL}
Content-Type: text/plain;charset=utf-8   (ver seção abaixo — não é engano)

{
  "action": "nome_da_acao",
  "token": "token_de_sessao_ou_null",
  "payload": { ...dados da ação... }
}
```

Resposta (sempre HTTP 200; erros de negócio vão no corpo, não no status
HTTP):

```json
{ "ok": true, "data": { ... } }
```
ou
```json
{ "ok": false, "erro": "mensagem legível", "codigo": "opcional, ver abaixo" }
```

`codigo` é opcional e serve pra frontend tratar um erro específico sem
depender do texto de `erro` (que é só pra exibir). Hoje existem:

| codigo | Quando acontece | O que o frontend faz |
|---|---|---|
| `SESSAO_INVALIDA` | Token ausente, inexistente, expirado, ou usuário associado inativo | `chamarBackend` (assets/js/api.js) já desloga e redireciona pro login sozinho, em QUALQUER chamada — nenhuma tela precisa tratar isso na mão |
| `FORMATO_NAO_SUPORTADO` | Upload de arquivo que não é PDF nem HTML | Mostrado no item da lista de upload; não impede os outros arquivos do lote |
| `ARQUIVO_VAZIO` | Upload de arquivo com 0 bytes | Idem |
| `ARQUIVO_MUITO_GRANDE` | Upload maior que 20MB | Idem |
| `ARQUIVO_INVALIDO` | Nome de arquivo ou base64 ausente/corrompido | Idem |
| `PROCESSO_VAZIO` | `numero_processo` vazio no upload | Bloqueia o formulário antes de enviar (frontend também valida antes) |

`doPost` (em [Principal.gs](Principal.gs)) faz `JSON.parse` do corpo e
chama `rotearRequisicaoPost` (em [Router.gs](Router.gs)), que despacha
para a função registrada no mapa `ACOES_POST` conforme o `action`.

**Autorização:** toda action que não esteja em `ACOES_PUBLICAS`
(`Router.gs`) exige um `token` de sessão válido e não expirado —
verificado por `validarSessao` ([Auth.gs](Auth.gs)) antes de rodar a
action. A função da action recebe `(payload, sessao)`: `sessao` é
`{token, usuarioId, perfil, nome}` para actions protegidas, ou `null`
para as públicas.

Ações implementadas hoje:

| action | pública? | payload | data de sucesso |
|---|---|---|---|
| `ping` | sim | — | `{pong: true, servidor: <ISO>}` |
| `login` | sim | `{usuario, senha}` | `{token, perfil, nome}` |
| `meuPerfil` | não | — | `{perfil, nome}` — confirma que o token ainda vale |
| `uploadDocumento` | não | `{numero_processo, nome_arquivo, conteudo_base64, mimetype, texto_extraido?}` | `{id_documento, nome_arquivo, drive_file_id, renomeado, texto_extraido_ok}` — `nome_arquivo` pode vir diferente do enviado se houve versionamento (`renomeado: true`); `texto_extraido` é opcional (ver [Texto extraído dos documentos](#texto-extraído-dos-documentos-prompt-5)) |

Novas ações entram no mapa `ACOES_POST` conforme as telas forem
construídas.

### GET (só healthcheck)

```
GET {APPS_SCRIPT_URL}?action=ping
```

```json
{ "ok": true, "data": { "pong": true, "servidor": "2026-08-19T12:00:00.000Z" } }
```

GET só aceita `action=ping` — qualquer outro valor (ou ausência do
parâmetro) retorna `{"ok": false, "erro": "..."}`. Isso é proposital:
GET pode ser disparado sem querer (link prefetching do navegador,
crawlers, alguém colando a URL no navegador), então nenhuma ação com
efeito colateral deve ser alcançável por GET.

## Por que `text/plain` em vez de `application/json`

O Apps Script Web App não responde a requisições `OPTIONS` (o preflight
CORS que o navegador dispara automaticamente antes de um POST com
`Content-Type: application/json`) — a requisição falha antes mesmo de
chegar em `doPost`.

Para evitar o preflight, `chamarBackend` (em
[frontend/assets/js/api.js](../frontend/assets/js/api.js)) envia o corpo
como `Content-Type: text/plain;charset=utf-8`, mesmo o conteúdo sendo
JSON — `text/plain` é um dos ["content types simples"](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSInvalidAllowHeader)
que não disparam preflight. Do lado do backend, `doPost` (em
[Principal.gs](Principal.gs)) faz `JSON.parse(e.postData.contents)`
manualmente, já que o Apps Script não interpreta o corpo automaticamente
quando o tipo declarado não é `application/json`.

Essa convenção vale só para POST. GET não tem corpo — os parâmetros vão
na query string (`?action=ping`) e chegam em `e.parameter`.

## TextoUtils.gs — utilitários de texto

[TextoUtils.gs](TextoUtils.gs) reúne funções sobre o texto extraído dos
documentos (ver [Texto extraído dos documentos](#texto-extraído-dos-documentos-prompt-5)),
pensadas pra serem reaproveitadas pelas próximas funcionalidades de
reconhecimento de padrões (identificação de tipo/etapa, checklist,
divergências) em vez de cada uma reimplementar a própria busca de texto:

- **`buscarPalavrasChave(texto, listaPalavras)`** — devolve o
  subconjunto de `listaPalavras` que aparece em `texto`, ignorando
  maiúscula/minúscula e acentuação (`repactuação` bate com
  `Repactuacao`). Pensada pra ser usada com a coluna `palavras_chave`
  dos checklists (`ChecklistTA`/`ChecklistRestituicao`/`ChecklistTC`,
  ver [Abas da planilha](#abas-da-planilha)).
- **`normalizarTexto(texto)`** — minúsculo e sem diacríticos; usada
  internamente por `buscarPalavrasChave`, mas exposta porque outras
  comparações de texto (fora de busca por palavra-chave) provavelmente
  vão precisar da mesma normalização.
- **`calcularHashTexto(texto)`** — SHA-256 de uma string, em hex; é o
  que preenche `DocumentosProcesso.hash_texto_extraido` no upload, e
  serve pra qualquer outra comparação "esse texto mudou desde a última
  vez?" que aparecer nas próximas funcionalidades.
