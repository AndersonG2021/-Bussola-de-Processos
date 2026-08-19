/**
 * Seed.gs — popula a planilha com a base de regras/dados de referência
 * do app (não é dado operacional, que entra pelo uso normal do sistema).
 *
 * Rode `seedBaseDeRegras` MANUALMENTE, uma única vez, direto no editor
 * do Apps Script (selecione a função no dropdown ao lado de "Depuração"
 * e clique em "Executar"). É seguro rodar de novo: cada aba só recebe
 * as linhas de seed se ainda estiver vazia (ver inserirLinhasSeVazia em
 * Planilha.gs) — não duplica dados.
 *
 * A definição de cabeçalho de cada aba (fonte da verdade) está em
 * ESQUEMA_ABAS, e é documentada em detalhe em ESQUEMA.md — mantenha os
 * dois em sincronia se alguma coluna mudar.
 */

const ESQUEMA_ABAS = {
  Usuarios: ['id', 'nome', 'usuario_login', 'senha_hash', 'senha_salt', 'perfil', 'ativo'],
  Sessoes: ['token', 'usuario_id', 'criado_em', 'expira_em'],
  Processos: [
    'numero_processo', 'tipo_processo', 'subtipo_pleito', 'etapa_atual',
    'status', 'drive_folder_id', 'criado_em', 'atualizado_em',
  ],
  AnalisesHistorico: [
    'id_analise', 'numero_processo', 'versao', 'analisado_por', 'data_analise',
    'tipo_identificado', 'confianca', 'etapa_identificada', 'divergencias_json',
    'sintese_objetivo', 'sintese_historico', 'sintese_proximo_passo',
  ],
  DocumentosProcesso: [
    'id_documento', 'numero_processo', 'nome_arquivo', 'drive_file_id',
    'texto_extraido_ok', 'hash_conteudo',
  ],
  TiposProcesso: ['nome_tipo', 'descricao'],
  SubtiposPleito: ['subtipo', 'tipo_processo', 'checklist_associado'],
  ChecklistTA: ['etapa_ordem', 'nome_etapa', 'documentos_esperados', 'palavras_chave', 'setor_responsavel', 'obrigatorio'],
  ChecklistRestituicao: ['etapa_ordem', 'nome_etapa', 'documentos_esperados', 'palavras_chave', 'setor_responsavel', 'obrigatorio'],
  ChecklistTC: ['etapa_ordem', 'nome_etapa', 'documentos_esperados', 'palavras_chave', 'setor_responsavel', 'obrigatorio'],
  AtribuicoesSetor: ['sigla', 'nome_setor', 'descricao'],
  RegrasEspeciais: ['nome_regra', 'valor', 'descricao'],
};

/**
 * PENDENTE: as 13 macro-etapas do fluxo genérico de Termo Aditivo ainda
 * não foram informadas. Cada linha deve seguir a ordem de
 * ESQUEMA_ABAS.ChecklistTA:
 *   [etapa_ordem, nome_etapa, documentos_esperados, palavras_chave, setor_responsavel, obrigatorio]
 * Enquanto isso, seedBaseDeRegras() só cria a aba com o cabeçalho.
 */
const ETAPAS_TERMO_ADITIVO = [];

/**
 * PENDENTE: as 8 etapas do fluxo de Restituição de Déficit Financeiro
 * ainda não foram informadas. Mesmo formato de linha do ChecklistTA.
 */
const ETAPAS_RESTITUICAO_DEFICIT = [];

/**
 * Cria (se preciso) todas as abas da planilha com o cabeçalho correto e
 * popula as que já têm dados de referência definidos.
 */
function seedBaseDeRegras() {
  // --- Tipos de processo ---------------------------------------------
  const abaTipos = obterOuCriarAba('TiposProcesso', ESQUEMA_ABAS.TiposProcesso);
  inserirLinhasSeVazia(abaTipos, [
    ['Termo Aditivo', 'Aditamento de convênio/contrato já vigente (aditivo de prazo, valor ou objeto).'],
    ['Termo de Compromisso', 'Novo instrumento de repasse — checklist ainda pendente de definição pelo Gerente.'],
    ['Restituição de Déficit Financeiro', 'Pedido de ressarcimento por déficit financeiro apurado no exercício.'],
  ]);

  // --- Subtipos de pleito → checklist ---------------------------------
  // Hoje todos os subtipos listados são de Termo Aditivo. PE Acessível e
  // Operação de Crédito ainda não têm checklist definitivo mapeado.
  const abaSubtipos = obterOuCriarAba('SubtiposPleito', ESQUEMA_ABAS.SubtiposPleito);
  inserirLinhasSeVazia(abaSubtipos, [
    ['Aquisição de Bens', 'Termo Aditivo', 'ChecklistTA'],
    ['Obras', 'Termo Aditivo', 'ChecklistTA'],
    ['Ajuste de Metas/Serviços Assistenciais', 'Termo Aditivo', 'ChecklistTA'],
    ['Repactuação Financeira', 'Termo Aditivo', 'ChecklistTA'],
    ['Emendas Parlamentares', 'Termo Aditivo', 'ChecklistTA'],
    ['Prorrogação', 'Termo Aditivo', 'ChecklistTA'],
    ['PE Acessível', 'Termo Aditivo', 'a confirmar'],
    ['Operação de Crédito', 'Termo Aditivo', 'a confirmar'],
  ]);

  // --- Checklists de etapas -------------------------------------------
  const abaChecklistTA = obterOuCriarAba('ChecklistTA', ESQUEMA_ABAS.ChecklistTA);
  inserirLinhasSeVazia(abaChecklistTA, ETAPAS_TERMO_ADITIVO); // hoje vazio, ver PENDENTE acima

  const abaChecklistRestituicao = obterOuCriarAba('ChecklistRestituicao', ESQUEMA_ABAS.ChecklistRestituicao);
  inserirLinhasSeVazia(abaChecklistRestituicao, ETAPAS_RESTITUICAO_DEFICIT); // hoje vazio, ver PENDENTE acima

  const abaChecklistTC = obterOuCriarAba('ChecklistTC', ESQUEMA_ABAS.ChecklistTC);
  inserirLinhasSeVazia(abaChecklistTC, [
    ['', '(pendente de definição pelo Gerente)', '', '', '', ''],
  ]);

  // --- Setores responsáveis --------------------------------------------
  // Ainda sem dados definidos — só cria a aba com o cabeçalho.
  obterOuCriarAba('AtribuicoesSetor', ESQUEMA_ABAS.AtribuicoesSetor);

  // --- Regras especiais --------------------------------------------------
  const abaRegras = obterOuCriarAba('RegrasEspeciais', ESQUEMA_ABAS.RegrasEspeciais);
  inserirLinhasSeVazia(abaRegras, [
    [
      'teto_dispensa_ta_aquisicao_bem_custeio',
      62725.59,
      'Teto anual de dispensa de Termo Aditivo para aquisição de bem via custeio: até R$ 62.725,59/ano por unidade.',
    ],
  ]);

  // --- Abas operacionais ---------------------------------------------
  // Só cabeçalho — são preenchidas pelo uso normal do app, não por seed.
  obterOuCriarAba('Usuarios', ESQUEMA_ABAS.Usuarios);
  obterOuCriarAba('Sessoes', ESQUEMA_ABAS.Sessoes);
  obterOuCriarAba('Processos', ESQUEMA_ABAS.Processos);
  obterOuCriarAba('AnalisesHistorico', ESQUEMA_ABAS.AnalisesHistorico);
  obterOuCriarAba('DocumentosProcesso', ESQUEMA_ABAS.DocumentosProcesso);

  Logger.log('seedBaseDeRegras concluído.');
}
