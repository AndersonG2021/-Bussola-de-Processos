/**
 * Seed.gs — popula a planilha com a base de regras/dados de referência
 * do app (não é dado operacional, que entra pelo uso normal do sistema).
 *
 * Rode `seedBaseDeRegras` MANUALMENTE, uma única vez, direto no editor
 * do Apps Script (selecione a função no dropdown ao lado de "Depuração"
 * e clique em "Executar"). É seguro rodar de novo: cada aba só recebe
 * as linhas de seed se ainda estiver vazia (ver inserirLinhasSeVazia em
 * Planilha.gs) — não duplica dados. Isso também significa que, se a
 * aba já tiver sido semeada e você editar os arrays abaixo, rodar de
 * novo NÃO atualiza a aba já populada — nesse caso limpe as linhas de
 * dados da aba manualmente antes de rodar de novo.
 *
 * A definição de cabeçalho de cada aba (fonte da verdade) está em
 * ESQUEMA_ABAS, e é documentada em detalhe em ESQUEMA.md — mantenha os
 * dois em sincronia se alguma coluna mudar.
 *
 * Fonte dos dados de fluxo (etapas, subtipos, atribuições de setor):
 * "Fluxo dos Termos Aditivos (Antigo).odt" fornecido pelo usuário em
 * 2026-08-19, mais o texto do teto de dispensa e do fluxo de
 * Restituição de Déficit Financeiro do mesmo arquivo.
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
 * 13 macro-etapas do fluxo genérico de Termo Aditivo (seções 1 a 13 do
 * documento-fonte; a seção 0, "preparação e escopo", é anterior à
 * abertura do pleito e não entra como etapa). As etapas 9 a 13 são
 * marcadas como não obrigatórias por serem boas práticas, exceções ou
 * material de referência/apoio, não passos sequenciais do trâmite.
 */
const ETAPAS_TERMO_ADITIVO = [
  [1, 'Abertura do pleito (Solicitação)',
    'Justificativa com base legal/contratual; estudo de série histórica/financeira; nota técnica da área especialista + 3 cotações (quando aplicável); NTA da SEAS (ajuste assistencial); despacho/CI conforme origem (NUGEP para emenda estadual, GCON para emenda federal)',
    'solicitação, justificativa, nota técnica, NTA, despacho, CI, pleito, estudo técnico',
    'OSS, SEAS, DGMCG, NUGEP, GCON', true],
  [2, 'Confirmação e validação inicial',
    'NTA da SEAS confirmando pertinência assistencial (quando houver impacto assistencial); consulta de viabilidade à OSS; Plano de Trabalho + Mapa de Cotações ≥3 (emendas)',
    'validação, viabilidade, NTA, plano de trabalho, mapa de cotações',
    'DGMCG', true],
  [3, 'Composição inicial de documentos',
    'Nota Técnica Financeira (GAVFCG) quando há impacto orçamentário sem NTA; cotações para declaração de compatibilidade/vantajosidade (GACDE para bens, DGI para obras/reformas); ficha RENEM quando dispensa avaliação de preço',
    'nota técnica financeira, compatibilidade, vantajosidade, RENEM, cotações',
    'GGPCG, GACDE, DGI', true],
  [4, 'Ciência da Executiva',
    'Registro de ciência formal da SECI',
    'ciência, SECI, marco processual',
    'SECI', true],
  [5, 'Composição técnica e orçamentária (consolidação)',
    'SOF (Solicitação Orçamentária Financeira) da GAOCG; Parecer conclusivo da CTAI; Parecer conclusivo da CMA (dispensado quando não há contrato)',
    'SOF, parecer CTAI, parecer CMA, solicitação orçamentária financeira',
    'GAOCG, CTAI, CMA', true],
  [6, 'Autorizações (ato formal)',
    'Ato de Aprovação assinado pela SECI (ou representante); autorização do ordenador máximo da SES',
    'ato de aprovação, autorização, ordenador de despesa',
    'DGMCG, SECI, SES', true],
  [7, 'Encaminhamento ao Jurídico',
    'Despacho da DGMCG à GGPCG para instrução formal; despacho da GGPCG à CJCG solicitando a formalização do TA, com inventário dos documentos formadores',
    'encaminhamento, instrução formal, inventário de documentos',
    'DGMCG, GGPCG, CJCG', true],
  [8, 'Formalização jurídica do TA (CJCG → GJCONV)',
    'Consulta à GPOAS sobre autorização da CPF; dossiê de regularidade da OSS; valores atuais de repasse (GAOCG); Nota Técnica Jurídica; Parecer PGE (se necessário); Minuta do TA; assinaturas (1º OSS, 2º SES); memorando de celebração; publicação no DOE',
    'nota técnica jurídica, minuta, parecer PGE, assinatura, publicação DOE, memorando de celebração',
    'CJCG, GJCONV', true],
  [9, 'Pós-publicação e implantação',
    'Comunicação oficial à unidade/OSS, SEAS, áreas técnicas e controle interno; atualização de planilhas/BI de contratos; arquivamento no SEI',
    'comunicação, implantação, controles, arquivamento SEI, boas práticas',
    'DGMCG', false],
  [10, 'Fluxos especiais e exceções',
    'Plano de Trabalho + Mapa de Cotações ≥3 (emendas); ficha RENEM (bens, dispensa GACDE); validação de aderência operacional com a OSS (prorrogação); controle do teto de dispensa de TA para aquisição de bem via custeio',
    'emenda parlamentar, RENEM, prorrogação, dispensa, teto, pequena monta',
    'DGMCG, CJCG', false],
  [11, 'Checklist por subtipo de pleito (referência)',
    'Consultar o checklist específico do subtipo do pleito (Aquisição de Bens, Obras/Reformas, Ajuste de Metas/Serviços, Repactuação/Recomposição/Negociação Financeira, Emendas)',
    'checklist, subtipo, aquisição de bens, obras, ajuste de metas, repactuação, emendas',
    '', false],
  [12, 'Pontos de controle — causas comuns de devolução',
    'Conferência final: SOF coerente com o pleito; mapa de cotações completo e compatível com o Plano de Trabalho; NTA/SEAS quando houve impacto assistencial; declaração de compatibilidade (GACDE/DGI) presente; Parecer PGE quando exigido; certidões de regularidade da OSS válidas; publicação no DOE anexada',
    'devolução, retrabalho, pontos de controle, certidões vencidas',
    '', false],
  [13, 'Roteiro resumido (síntese para a capa do processo)',
    'Roteiro resumido do fluxo: solicitação → validação DGMCG → compatibilidade/NT financeira → ciência SECI → SOF/pareceres → ato/autorização → jurídico (CJCG/GJCONV) → assinaturas → publicação DOE → implantação',
    'roteiro resumido, capa do processo, síntese do fluxo',
    '', false],
];

/**
 * 8 etapas do fluxo de Restituição de Déficit Financeiro. O documento-
 * fonte só numera 5 seções (com 17 itens no total); estas 8 etapas são
 * um agrupamento desses 17 itens em blocos coerentes, confirmado com o
 * usuário antes de popular a planilha.
 */
const ETAPAS_RESTITUICAO_DEFICIT = [
  [1, 'Solicitação',
    'Pedido da OSS solicitando recomposição financeira por déficit orçamentário',
    'solicitação, recomposição financeira, déficit',
    'OSS', true],
  [2, 'Análise financeira inicial e elaboração do Relatório Financeiro',
    'Análise das Prestações de Contas mensais (GAFCG); Relatório Financeiro consolidado (GAVFCG/GSCG) baseado nas Planilhas Contábil-Financeiras (PCF) e no Manual de Prestação de Contas, detalhando Receitas, Despesas com Pessoal/Estoque/Serviços e o resultado (déficit/superávit) ajustado',
    'relatório financeiro, planilha contábil-financeira, PCF, déficit, superávit, prestação de contas',
    'GAFCG, GAVFCG, GSCG', true],
  [3, 'Tratamento de inconsistências (contraditório)',
    'Notificação à unidade sobre inconsistências identificadas, com prazo para resposta, justificativas e nova documentação',
    'inconsistência, contraditório, ampla defesa, prazo de resposta',
    'GAVFCG, GSCG', true],
  [4, 'Consultas complementares',
    'Verificação de passivos em aberto no Sistema E-Fisco (GPAG); informações sobre desconto de metas e integralidade dos pagamentos de custeio (GAOCG/GGPCG)',
    'passivo, E-Fisco, desconto de metas, custeio',
    'GPAG, GAOCG, GGPCG', true],
  [5, 'Encaminhamento à DGCI e validação como Parecer Técnico',
    'Relatório Financeiro encaminhado à DGCI para ciência; manifestação da CTAI (ou GSCG/GAVFCG, conforme competência vigente); validação do Relatório Financeiro como Parecer Técnico favorável (Decreto Estadual nº 54.107/2022)',
    'DGCI, CTAI, parecer técnico, decreto estadual',
    'DGCI, CTAI, GSCG', true],
  [6, 'Elaboração da Minuta e autorização de despesa',
    'Minuta do Termo de Ressarcimento (DGAJ/GJCONV/CJCG); ciência e autorização expressa de ordenador de despesas da SES',
    'minuta, termo de ressarcimento, autorização de despesa, ordenador',
    'DGAJ, GJCONV, CJCG, SES', true],
  [7, 'Análise externa (SCGE e PGE)',
    'Encaminhamento à SCGE com parecer técnico favorável e minuta para declaração de regularidade (Lei Estadual nº 15.210/2013); análise jurídico-formal pela PGE; ajustes conforme eventuais recomendações da SCGE',
    'SCGE, regularidade, PGE, lei estadual, devolução',
    'SCGE, PGE', true],
  [8, 'Formalização, publicação e pagamento',
    'Termo de Ressarcimento assinado (Superintendência da OSS e Secretária Estadual de Saúde); publicação no Diário Oficial do Estado; pagamento no prazo legal de 60 dias',
    'assinatura, publicação DOE, pagamento, prazo legal 60 dias',
    'CJCG, GJCONV, SES', true],
];

/**
 * Tipos de processo e subtipos de pleito → checklist.
 *
 * Os 8 primeiros subtipos de Termo Aditivo vieram do Prompt 2. Os
 * demais foram extraídos da tabela "TIPO DO PROCESSO / INSTRUÇÃO" do
 * documento-fonte (só as linhas categorizadas como "Termo Aditivo" ou
 * "TC" — linhas de outras categorias, tipo "Diverso" e "Seleção", não
 * fazem parte do escopo deste app e ficaram de fora). Duas duplas
 * quase-sinônimas do documento foram mantidas como itens distintos, à
 * espera de revisão: "Obras" (Prompt 2) vs "Obra" (documento), e
 * "Repactuação Financeira" (Prompt 2) vs "Repactuação Financeira
 * (Meta)" (documento).
 */
const SUBTIPOS_PLEITO = [
  // --- Termo Aditivo: definidos no Prompt 2 (PE Acessível e Operação
  // de Crédito agora resolvidos para ChecklistTA, conforme a tabela do
  // documento-fonte) ---
  ['Aquisição de Bens', 'Termo Aditivo', 'ChecklistTA'],
  ['Obras', 'Termo Aditivo', 'ChecklistTA'],
  ['Ajuste de Metas/Serviços Assistenciais', 'Termo Aditivo', 'ChecklistTA'],
  ['Repactuação Financeira', 'Termo Aditivo', 'ChecklistTA'],
  ['Emendas Parlamentares', 'Termo Aditivo', 'ChecklistTA'],
  ['Prorrogação', 'Termo Aditivo', 'ChecklistTA'],
  ['PE Acessível', 'Termo Aditivo', 'ChecklistTA'],
  ['Operação de Crédito', 'Termo Aditivo', 'ChecklistTA'],
  // --- Termo Aditivo: adicionados a partir da tabela do documento ---
  ['Ajuste Contratual', 'Termo Aditivo', 'ChecklistTA'],
  ['Alteração de Perfil', 'Termo Aditivo', 'ChecklistTA'],
  ['Ampliação de Leitos', 'Termo Aditivo', 'ChecklistTA'],
  ['Ampliação Serviços', 'Termo Aditivo', 'ChecklistTA'],
  ['Aquisições Não Patrimoniais', 'Termo Aditivo', 'ChecklistTA'],
  ['Emenda Custeio', 'Termo Aditivo', 'ChecklistTA'],
  ['Emenda Investimento', 'Termo Aditivo', 'ChecklistTA'],
  ['Programas / Políticas', 'Termo Aditivo', 'ChecklistTA'],
  ['Rateio', 'Termo Aditivo', 'ChecklistTA'],
  ['Obra', 'Termo Aditivo', 'ChecklistTA'],
  ['Renegociação', 'Termo Aditivo', 'ChecklistTA'],
  ['Sazonalidade', 'Termo Aditivo', 'ChecklistTA'],
  ['Recomposição de Provisão', 'Termo Aditivo', 'ChecklistTA'],
  ['Repactuação de Meta', 'Termo Aditivo', 'ChecklistTA'],
  ['Renegociação de Termo Aditivo', 'Termo Aditivo', 'ChecklistTA'],
  ['Repactuação Financeira (Meta)', 'Termo Aditivo', 'ChecklistTA'],
  // --- Termo de Compromisso: checklist ainda pendente (ChecklistTC vazio) ---
  ['Termo de Compromisso (Operacionalização)', 'Termo de Compromisso', 'ChecklistTC'],
  ['Termo de Compromisso (Pagamento)', 'Termo de Compromisso', 'ChecklistTC'],
];

/**
 * Setores/siglas citados no fluxo. Descrições condensadas a partir do
 * texto do documento-fonte (das tabelas "ATRIBUIÇÕES DGMCG"/
 * "ATRIBUIÇÕES CTAI" quando disponível, senão do papel do setor
 * descrito na narrativa do fluxo). Setores citados nas tabelas de
 * atribuições cuja sigla não é confirmada em nenhum outro trecho do
 * documento (ex.: as coordenações de supervisão por macrorregião da
 * CTAI) foram deixados de fora para não inventar abreviação.
 */
const ATRIBUICOES_SETOR = [
  ['DGMCG', 'Diretoria Geral de Monitoramento dos Contratos de Gestão',
    'Acompanha, avalia e monitora a execução dos Contratos de Gestão; zela pela conformidade legal e qualidade dos serviços; ordena a despesa dos Contratos de Gestão.'],
  ['CJCG', 'Coordenação Jurídica dos Contratos de Gestão',
    'Monitora as demandas jurídicas dos Contratos de Gestão; instrui a formalização de Termos Aditivos junto à GJCONV; consulta a GPOAS e acosta a documentação de regularidade da OSS.'],
  ['GJCONV', 'Gerência Jurídica de Convênios dos Contratos de Gestão (Gestor Jurídico)',
    'Elabora a minuta do Termo Aditivo/Termo de Ressarcimento; verifica/solicita Parecer PGE; resolve contradições jurídicas antes da minuta.'],
  ['ATCG', 'Assessoria Técnica dos Contratos de Gestão',
    'Assessora o acompanhamento da execução dos Contratos de Gestão e a conformidade normativa; apoia processos de repactuação e reequilíbrio financeiro.'],
  ['GGPCG', 'Gerência de Gestão de Processos dos Contratos de Gestão',
    'Modela e gerencia o risco dos fluxos de processo da Diretoria; recebe o pleito da DGMCG e encaminha à CJCG para formalização.'],
  ['CMTCG', 'Coordenação de Modelagem Técnica dos Contratos de Gestão',
    'Modela a matéria técnica dos Contratos de Gestão (indicadores e metas) e minuta os anexos técnicos em caso de aditamento.'],
  ['CGMCG', 'Coordenação Geral de Modelagem dos Contratos de Gestão',
    'Coordena a instrução processual e a modelagem dos fluxos de processos da Diretoria; mantém o manual de fluxos de processos.'],
  ['CEXCG', 'Coordenação Executiva dos Contratos de Gestão (Coordenação de Patrimônio, Investimento e Emendas Parlamentares)',
    'Gerencia patrimônio, questões logísticas e emendas parlamentares dos Contratos de Gestão; responsável pela instrução de pleitos de Operação de Crédito.'],
  ['SECI', 'Secretaria Executiva de Coordenação Institucional',
    'Dá ciência formal ao pleito de Termo Aditivo (marco para as etapas orçamentárias e de pareceres) e assina o Ato de Aprovação.'],
  ['GAOCG', 'Gerência Administrativa Orçamentária dos Contratos de Gestão',
    'Emite a SOF (Solicitação Orçamentária Financeira) e monitora a execução orçamentária/financeira dos Contratos de Gestão.'],
  ['CTAI', 'Comissão Técnica de Acompanhamento Interno',
    'Emite parecer conclusivo sobre a aderência do pleito ao contrato de gestão; pode ser acionada para manifestação sobre o Relatório Financeiro de Restituição de Déficit.'],
  ['GACDE', 'GACDE (nome por extenso não encontrado no documento-fonte)',
    'Emite a Declaração de Compatibilidade/Vantajosidade de preço para aquisição de bens (dispensada quando a unidade usa o RENEM).'],
  ['DGI', 'DGI (nome por extenso não encontrado no documento-fonte)',
    'Emite a Declaração de Compatibilidade/Vantajosidade de preço para obras/reformas, com base em laudo de Engenharia Civil.'],
  ['CMA', 'CMA (nome por extenso não encontrado no documento-fonte)',
    'Emite parecer conclusivo complementar ao da CTAI sobre o pleito de Termo Aditivo (dispensado quando não há contrato).'],
  ['SEAS', 'SEAS (nome por extenso não encontrado no documento-fonte)',
    'Solicita ajustes assistenciais (reforço/supressão de serviços) via Nota Técnica Assistencial (NTA), validada com a OSS por intermédio da DGMCG.'],
  ['NUGEP', 'NUGEP (nome por extenso não encontrado no documento-fonte)',
    'Solicita Termo Aditivo de emenda parlamentar estadual, com despacho contendo parlamentar, categoria, nº da emenda e demais dados orçamentários.'],
  ['GCON', 'GCON (nome por extenso não encontrado no documento-fonte)',
    'Solicita Termo Aditivo de emenda parlamentar federal, com CI contendo nº da proposta, valor, fonte e dados da emenda.'],
  ['GAVFCG', 'Gerência de Análise e Validação Financeira dos Contratos de Gestão',
    'Emite Nota Técnica Financeira sobre o impacto orçamentário de pleitos não assistenciais; consolida dados da GAFCG no Relatório Financeiro de Restituição de Déficit.'],
  ['GPOAS', 'GPOAS (nome por extenso não encontrado no documento-fonte)',
    'Consultada pela CJCG sobre a necessidade de autorização da CPF (Câmara de Programação Financeira) na formalização do TA.'],
  ['PGE', 'Procuradoria Geral do Estado',
    'Emite parecer jurídico-formal sobre o Termo Aditivo/Termo de Ressarcimento, quando exigido.'],
  ['GPAG', 'Gerência Financeira de Pagamento',
    'Verifica a existência de passivos em aberto no Sistema E-Fisco decorrentes do Contrato de Gestão.'],
  ['GAFCG', 'Gerência de Acompanhamento Contábil-Financeiro dos Contratos de Gestão',
    'Realiza a análise das Prestações de Contas mensais da unidade, base do Relatório Financeiro de Restituição de Déficit.'],
  ['GSCG', 'Gerência de Supervisão dos Contratos de Gestão',
    'Pode assumir, conforme a estrutura interna, a consolidação do Relatório Financeiro e a competência de acompanhamento no lugar da CTAI.'],
  ['DGCI', 'Diretoria Geral de Controle Interno',
    'Recebe o Relatório Financeiro para ciência e providências; valida o relatório como Parecer Técnico no processo de Restituição de Déficit.'],
  ['DGAJ', 'Diretoria Geral de Assuntos Jurídicos',
    'Recebe o processo de Restituição de Déficit para elaboração da Minuta do Termo de Ressarcimento (via GJCONV/CJCG).'],
  ['SCGE', 'Secretaria da Controladoria-Geral do Estado',
    'Declara a regularidade do processo de Restituição de Déficit Financeiro (Lei Estadual nº 15.210/2013).'],
];

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
  const abaSubtipos = obterOuCriarAba('SubtiposPleito', ESQUEMA_ABAS.SubtiposPleito);
  inserirLinhasSeVazia(abaSubtipos, SUBTIPOS_PLEITO);

  // --- Checklists de etapas -------------------------------------------
  const abaChecklistTA = obterOuCriarAba('ChecklistTA', ESQUEMA_ABAS.ChecklistTA);
  inserirLinhasSeVazia(abaChecklistTA, ETAPAS_TERMO_ADITIVO);

  const abaChecklistRestituicao = obterOuCriarAba('ChecklistRestituicao', ESQUEMA_ABAS.ChecklistRestituicao);
  inserirLinhasSeVazia(abaChecklistRestituicao, ETAPAS_RESTITUICAO_DEFICIT);

  const abaChecklistTC = obterOuCriarAba('ChecklistTC', ESQUEMA_ABAS.ChecklistTC);
  inserirLinhasSeVazia(abaChecklistTC, [
    ['', '(pendente de definição pelo Gerente)', '', '', '', ''],
  ]);

  // --- Setores responsáveis --------------------------------------------
  const abaAtribuicoes = obterOuCriarAba('AtribuicoesSetor', ESQUEMA_ABAS.AtribuicoesSetor);
  inserirLinhasSeVazia(abaAtribuicoes, ATRIBUICOES_SETOR);

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
