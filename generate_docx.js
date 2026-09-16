// ============================================================================
// PROJETO: O Orçamento na Hora (SENAI-SP)
// SCRIPT: generate_docx.js
// DESCRIÇÃO: Gera o documento oficial RELATORIO_ENTREGA.docx espelhando
//            rigorosamente a estrutura, a diagramação e os quadros oficiais
//            da folha de atividade prática do SENAI-SP.
// ============================================================================

const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  HeadingLevel,
  ExternalHyperlink,
  Footer,
  PageNumber,
  VerticalAlign
} = require('docx');

// --- Paleta Institucional SENAI-SP ---
const COLOR = {
  CORPORATE_BLUE: '003366', // Azul Corporativo SENAI (#003366)
  DARK_GRAY: '1F2937',      // Preto Fosco / Cinza Escuro Títulos H2 (#1f2937)
  BODY_TEXT: '27272A',      // Cinza Neutro Escuro Corpo (#27272a)
  MUTED_GRAY: '4B5563',     // Cinza Médio Subtítulo e Rodapé (#4b5563)
  LIGHT_BORDER: 'CBD5E1',   // Cinza Claro Borda 1px (#cbd5e1)
  ZEBRA_BG: 'F8FAFC',       // Cinza Suave Alternado Linhas (#f8fafc)
  WHITE: 'FFFFFF',          // Branco Puro (#ffffff)
  SUCCESS_GREEN: '047857',   // Verde Sucesso Aprovação (#047857)
  BOX_BG: 'F8FAFC',         // Fundo Caixa Cabeçalho
};

// Bordas de tabela padrão de 1px (#cbd5e1)
const standardBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: COLOR.LIGHT_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: COLOR.LIGHT_BORDER },
  left: { style: BorderStyle.SINGLE, size: 1, color: COLOR.LIGHT_BORDER },
  right: { style: BorderStyle.SINGLE, size: 1, color: COLOR.LIGHT_BORDER },
};

// Bordas invisíveis para alinhamento de rodapé
const borderless = {
  top: { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
};

// Padding interno padrão das células (120 dxa sup/inf, 160 dxa esq/dir)
const cellMargins = {
  top: 120,
  bottom: 120,
  left: 160,
  right: 160,
};

// Helper: Célula de Cabeçalho (Azul Corporativo #003366, texto branco 10pt negrito)
function createHeaderCell(text, widthPercent, align = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    borders: standardBorders,
    shading: { fill: COLOR.CORPORATE_BLUE },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: text,
            bold: true,
            color: COLOR.WHITE,
            size: 20, // 10pt
            font: 'Segoe UI',
          }),
        ],
      }),
    ],
  });
}

// Helper: Célula de Dados (9.5pt, regular, zebra branco / #F8FAFC)
function createDataCell(content, widthPercent, isZebra = false, align = AlignmentType.LEFT) {
  let paragraphs = [];

  if (typeof content === 'string') {
    paragraphs = [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: content,
            color: COLOR.BODY_TEXT,
            size: 19, // 9.5pt
            font: 'Segoe UI',
          }),
        ],
      }),
    ];
  } else if (Array.isArray(content)) {
    paragraphs = content;
  } else {
    paragraphs = [content];
  }

  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    borders: standardBorders,
    shading: isZebra ? { fill: COLOR.ZEBRA_BG } : { fill: COLOR.WHITE },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    children: paragraphs,
  });
}

// Helper: Título de Seção Principal (Heading 1 - 13pt, Negrito, Caixa Alta, #003366, 180 dxa antes, 80 dxa depois)
function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 26, // 13pt
        color: COLOR.CORPORATE_BLUE,
        font: 'Segoe UI',
      }),
    ],
  });
}

// Helper: Subtítulo de Seção (Heading 2 - 11pt, Negrito, #1F2937, 120 dxa antes, 60 dxa depois)
function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 120, after: 60 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 22, // 11pt
        color: COLOR.DARK_GRAY,
        font: 'Segoe UI',
      }),
    ],
  });
}

// Helper: Parágrafo Normal de Texto (10.5pt, entrelinha 1,15 = line: 276, cor #27272A, after: 80 dxa)
function createParagraph(runs, spacingAfter = 80) {
  return new Paragraph({
    spacing: { after: spacingAfter, line: 276 },
    children: runs.map((r) => {
      if (typeof r === 'string') {
        return new TextRun({ text: r, color: COLOR.BODY_TEXT, size: 21, font: 'Segoe UI' });
      }
      return new TextRun({
        text: r.text || '',
        bold: Boolean(r.bold),
        italics: Boolean(r.italics),
        color: r.color || COLOR.BODY_TEXT,
        size: r.size || 21, // 10.5pt
        font: 'Segoe UI',
      });
    }),
  });
}

// Helper: Item de Lista com Marcador
function createBullet(title, description) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60, line: 276 },
    children: [
      new TextRun({ text: `${title}: `, bold: true, color: COLOR.DARK_GRAY, size: 21, font: 'Segoe UI' }),
      new TextRun({ text: description, color: COLOR.BODY_TEXT, size: 21, font: 'Segoe UI' }),
    ],
  });
}

// Helper: Link Externo Formatado
function createLink(text, url) {
  return new ExternalHyperlink({
    children: [
      new TextRun({
        text: text,
        color: COLOR.CORPORATE_BLUE,
        underline: {},
        size: 19,
        font: 'Segoe UI',
      }),
    ],
    link: url,
  });
}

async function buildRelatorioDocx() {
  // ==========================================================================
  // QUADRO 1 — IDENTIFICAÇÃO DO ESTUDANTE E ENTREGÁVEIS DO PROJETO
  // ==========================================================================
  const quadro1 = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('Item de Identificação / Entregável', 35),
          createHeaderCell('Detalhamento Técnico / Link de Acesso Oficial', 65),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Estudante Responsável', 35, false),
          createDataCell(
            [
              new Paragraph({
                children: [
                  new TextRun({ text: 'MATHEUS HENRIQUE DE OLIVEIRA COSTA', bold: true, color: COLOR.BODY_TEXT, size: 19, font: 'Segoe UI' }),
                  new TextRun({ text: ' (Unidade: CFP Registro / EAD)', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            false
          ),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Ambiente de Produção (Chat Web)', 35, true),
          createDataCell(
            [
              new Paragraph({
                children: [
                  createLink('https://orcamento-na-hora.pages.dev/', 'https://orcamento-na-hora.pages.dev/'),
                  new TextRun({ text: ' — Aplicação pública no Cloudflare Pages com proposta comercial em tempo real', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            true
          ),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Painel Administrativo do Prestador', 35, false),
          createDataCell(
            [
              new Paragraph({
                children: [
                  createLink('https://orcamento-na-hora.pages.dev/admin.html', 'https://orcamento-na-hora.pages.dev/admin.html'),
                  new TextRun({ text: ' (Credenciais: Usuário ', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                  new TextRun({ text: 'admin', bold: true, color: COLOR.CORPORATE_BLUE, size: 18, font: 'Segoe UI' }),
                  new TextRun({ text: ' | Senha ', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                  new TextRun({ text: 'admin', bold: true, color: COLOR.CORPORATE_BLUE, size: 18, font: 'Segoe UI' }),
                  new TextRun({ text: ')', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            false
          ),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Bot Oficial no Telegram', 35, true),
          createDataCell(
            [
              new Paragraph({
                children: [
                  createLink('https://t.me/valdir_pintor_orcamento_bot', 'https://t.me/valdir_pintor_orcamento_bot'),
                  new TextRun({ text: ' (@valdir_pintor_orcamento_bot) — Webhook bidirecional ativo e alertas simultâneos', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            true
          ),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Repositório do Código (GitHub)', 35, false),
          createDataCell(
            [
              new Paragraph({
                children: [
                  createLink('https://github.com/matheuhenriqu/orcamento-na-hora', 'https://github.com/matheuhenriqu/orcamento-na-hora'),
                  new TextRun({ text: ' (Branch principal: main — Repositório auditado e versionado)', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            false
          ),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Infraestrutura em Nuvem', 35, true),
          createDataCell(
            [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Supabase Cloud (Projeto: ', color: COLOR.BODY_TEXT, size: 19, font: 'Segoe UI' }),
                  new TextRun({ text: 'odfvajqnaeodwzaljxzm', bold: true, color: COLOR.CORPORATE_BLUE, size: 19, font: 'Segoe UI' }),
                  new TextRun({ text: ') + Cloudflare Pages + Groq Cloud API', color: COLOR.MUTED_GRAY, size: 18, font: 'Segoe UI' }),
                ],
              }),
            ],
            65,
            true
          ),
        ],
      }),
    ],
  });

  // ==========================================================================
  // QUADRO 2 — TABELA OFICIAL DE PREÇOS E REGRAS DE NEGÓCIO
  // ==========================================================================
  const quadro2 = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('Serviço de Pintura', 28),
          createHeaderCell('Preço Unitário Fixo', 22),
          createHeaderCell('Critério Técnico de Execução', 50),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Parede Lisa', 28, false),
          createDataCell('R$ 120,00 / cômodo', 22, false),
          createDataCell('Emassamento, lixamento e aplicação de 2 demãos de tinta acrílica/látex padrão.', 50, false),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Parede com Textura', 28, true),
          createDataCell('R$ 180,00 / cômodo', 22, true),
          createDataCell('Aplicação de grafiato ou textura rústica com maior consumo de material e tempo de secagem.', 50, true),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Teto', 28, false),
          createDataCell('R$ 100,00 / cômodo', 22, false),
          createDataCell('Pintura técnica de tetos com acabamento fosco anti-respingos.', 50, false),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Desconto por Quantidade', 28, true),
          createDataCell('10% no Total', 22, true),
          createDataCell('Regra automática para volumes a partir de 5 cômodos contratados.', 50, true),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Taxa de Deslocamento', 28, false),
          createDataCell('+ R$ 30,00 fixos', 22, false),
          createDataCell('Adicionada caso o cliente indique localização afastada ou zona rural.', 50, false),
        ],
      }),
    ],
  });

  // ==========================================================================
  // QUADRO 3 — MATRIZ DE HOMOLOGAÇÃO E TESTES AUTOMATIZADOS
  // ==========================================================================
  const quadro3 = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createHeaderCell('Cenário de Teste', 24),
          createHeaderCell('Prompt / Entrada Fornecida', 32),
          createHeaderCell('Comportamento Esperado', 30),
          createHeaderCell('Status', 14, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Unitário #1: Textura', 24, false),
          createDataCell('2 cômodos de Textura', 32, false),
          createDataCell('Cálculo direto: 2 × R$ 180 = R$ 360,00', 30, false),
          createDataCell('✔ Aprovado', 14, false, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Unitário #2: Desconto 10%', 24, true),
          createDataCell('6 cômodos de Teto', 32, true),
          createDataCell('Aplicação 10% desc.: R$ 600 - R$ 60 = R$ 540,00', 30, true),
          createDataCell('✔ Aprovado', 14, true, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Unitário #3: Deslocamento', 24, false),
          createDataCell('2 cômodos Parede Lisa + Visita', 32, false),
          createDataCell('Soma determinística: R$ 240 + R$ 30 = R$ 270,00', 30, false),
          createDataCell('✔ Aprovado', 14, false, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('End-to-End #1: Tool Calling', 24, true),
          createDataCell('"Quero aplicar textura em 2 cômodos"', 32, true),
          createDataCell('Acionamento autônomo da tool: R$ 360,00', 30, true),
          createDataCell('✔ Aprovado', 14, true, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('End-to-End #2: Desconto IA', 24, false),
          createDataCell('"Pintar o teto de 6 cômodos"', 32, false),
          createDataCell('Reconhecimento do volume e desconto de 10%: R$ 540,00', 30, false),
          createDataCell('✔ Aprovado', 14, false, AlignmentType.CENTER),
        ],
      }),
      new TableRow({
        children: [
          createDataCell('Anti-Alucinação', 24, true),
          createDataCell('"Quanto custa pintar com textura?"', 32, true),
          createDataCell('Modelo recusa inventar valor e solicita cômodos', 30, true),
          createDataCell('✔ Aprovado', 14, true, AlignmentType.CENTER),
        ],
      }),
    ],
  });

  // ==========================================================================
  // RODAPÉ FORMAL (SENAI-SP à esquerda | Página X de Y à direita)
  // ==========================================================================
  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: borderless,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: borderless,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'SENAI-SP — Formação Profissional em IA Aplicada',
                    size: 18, // 9pt
                    color: COLOR.MUTED_GRAY,
                    font: 'Segoe UI',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: borderless,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'Página ', size: 18, color: COLOR.MUTED_GRAY, font: 'Segoe UI' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: COLOR.MUTED_GRAY, font: 'Segoe UI' }),
                  new TextRun({ text: ' de ', size: 18, color: COLOR.MUTED_GRAY, font: 'Segoe UI' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: COLOR.MUTED_GRAY, font: 'Segoe UI' }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ==========================================================================
  // MONTAGEM DO DOCUMENTO A4 COM MARGENS OFICIAIS SENAI-SP
  // ==========================================================================
  const doc = new Document({
    creator: 'MATHEUS HENRIQUE DE OLIVEIRA COSTA',
    title: 'Relatório Oficial de Atividade Prática — O Orçamento na Hora (SENAI-SP)',
    description: 'Documento oficial estruturado e diagramado conforme o padrão institucional SENAI-SP.',
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,  // Formato A4: 210 mm (11.906 twips)
              height: 16838, // Formato A4: 297 mm (16.838 twips)
            },
            margin: {
              top: 1417,    // Margem Superior: 2,5 cm (1.417 twips)
              bottom: 1417, // Margem Inferior: 2,5 cm (1.417 twips)
              left: 1701,   // Margem Esquerda: 3,0 cm (1.701 twips)
              right: 1134,  // Margem Direita: 2,0 cm (1.134 twips)
            },
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable],
          }),
        },
        children: [
          // CABEÇALHO INSTITUCIONAL
          new Paragraph({
            spacing: { before: 0, after: 40 },
            children: [
              new TextRun({
                text: 'SERVIÇO NACIONAL DE APRENDIZAGEM INDUSTRIAL — SENAI-SP',
                bold: true,
                size: 32, // 16pt
                color: COLOR.CORPORATE_BLUE,
                font: 'Segoe UI',
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 140 },
            children: [
              new TextRun({
                text: 'Unidade: CFP Registro / Educação a Distância (EAD)\n' +
                      'Curso: Aperfeiçoamento Profissional em Inteligência Artificial Generativa Aplicada à Programação\n' +
                      'Atividade Prática Individual: "O Orçamento na Hora" — Pintura Express (Valdir Pintor)',
                size: 24, // 12pt
                color: COLOR.MUTED_GRAY,
                font: 'Segoe UI',
              }),
            ],
          }),

          // 1. QUADRO 1 — IDENTIFICAÇÃO DO ESTUDANTE E ENTREGÁVEIS DO PROJETO
          createHeading1('1. QUADRO 1 — IDENTIFICAÇÃO DO ESTUDANTE E ENTREGÁVEIS DO PROJETO'),
          createParagraph([
            'O Quadro 1 consolida os dados de identificação do aluno e os links oficiais dos ambientes em produção, atestando a entrega e operação completa da solução desenvolvida:'
          ]),
          quadro1,

          new Paragraph({ spacing: { after: 120 } }),

          // 2. QUADRO 2 — TABELA OFICIAL DE PREÇOS E REGRAS DE NEGÓCIO
          createHeading1('2. QUADRO 2 — TABELA OFICIAL DE PREÇOS E REGRAS DE NEGÓCIO'),
          createParagraph([
            'O assistente virtual atua estritamente com a tabela de tarifas fixas e regras comerciais do profissional autônomo Valdir Pinturas & Acabamentos, sendo expressamente proibido de calcular valores de cabeça ou inventar dados:'
          ]),
          quadro2,

          new Paragraph({ spacing: { after: 80 } }),

          createParagraph([
            { text: 'Conformidade do Cálculo Determinístico em Edge Function: ', bold: true, color: COLOR.CORPORATE_BLUE },
            'A solução adota o princípio de cálculo desacoplado. O modelo de linguagem (Groq / Qwen 2.5 32B) atua como orquestrador de intenções semânticas e é obrigado a acionar a Edge Function ',
            { text: 'calcular_orcamento', bold: true },
            '. Essa abordagem computacional determinística elimina integralmente qualquer possibilidade de alucinação matemática pela IA, garantindo que o valor final, os descontos progressivos de 10% e as taxas de visita técnica obedeçam com precisão contábil à tabela oficial do pintor.'
          ]),

          new Paragraph({ spacing: { after: 120 } }),

          // 3. ARQUITETURA DA SOLUÇÃO E MODELO DE INTEGRAÇÃO
          createHeading1('3. ARQUITETURA DA SOLUÇÃO E MODELO DE INTEGRAÇÃO'),
          createParagraph([
            'O ecossistema do projeto foi estruturado segundo um padrão serverless moderno, dividindo as responsabilidades em quatro camadas técnicas de alta performance:'
          ]),

          createHeading2('3.1 Frontend e Camada de Apresentação (Cloudflare Pages)'),
          createParagraph([
            'Single Page Application desenvolvida em HTML5, CSS3 e JavaScript Vanilla puro, sem sobrecarga de frameworks. Apresenta layout corporativo no padrão ',
            { text: 'Swiss Industrial / High-Contrast SaaS', bold: true },
            ' com disposição em duas colunas estruturais no desktop, viewport adaptativo ',
            { text: '100dvh', bold: true },
            ' para dispositivos móveis, cards dinâmicos de resposta comercial e login gate por sessão (/admin.html).'
          ]),

          createHeading2('3.2 Camada de Inteligência Artificial e Raciocínio (Groq Cloud)'),
          createParagraph([
            'Processamento de linguagem natural com tempo de resposta ultrabaixo utilizando o modelo ',
            { text: 'Qwen 2.5 32B', bold: true },
            ' na Groq Cloud. Implementa Tool Calling nativo com schema rígido para as funções "calcular_orcamento" e "salvar_lead", além de system prompt com diretrizes rígidas anti-alucinação para interrogar dados faltantes antes de orçar.'
          ]),

          createHeading2('3.3 Backend Serverless e Persistência (Supabase Edge Functions)'),
          createParagraph([
            'Microsserviços desenvolvidos em Deno/TypeScript executados em nuvem na região sa-east-1 (/chat, /calcular-orcamento, /salvar-lead e /telegram-webhook). A persistência utiliza o PostgreSQL gerenciado do Supabase com tabelas dedicadas (tabela_precos, orcamentos_leads e telegram_inscritos) protegidas por Row Level Security (RLS).'
          ]),

          createHeading2('3.4 Mensageria em Tempo Real e Webhook (Telegram Bot API)'),
          createParagraph([
            'Integração oficial com o bot @valdir_pintor_orcamento_bot conectada ao endpoint /telegram-webhook. Permite autoinscrição de profissionais via comando /start, persistência na tabela telegram_inscritos, consultas operacionais (/orcamentos e /status) e despacho simultâneo de novos orçamentos com link direto para o WhatsApp do cliente.'
          ]),

          new Paragraph({ spacing: { after: 120 } }),

          // 4. QUADRO 3 — MATRIZ DE HOMOLOGAÇÃO E TESTES AUTOMATIZADOS
          createHeading1('4. QUADRO 3 — MATRIZ DE HOMOLOGAÇÃO E TESTES AUTOMATIZADOS'),
          createParagraph([
            'Para assegurar a conformidade irrestrita com todas as exigências da atividade prática, foi executada a suíte de testes sintéticos automatizados ',
            { text: 'test_scenarios.js', bold: true },
            ' contra os servidores de produção, obtendo ',
            { text: '100% de aprovação (6 de 6 cenários aprovados)', bold: true, color: COLOR.SUCCESS_GREEN },
            ':'
          ]),
          quadro3,

          new Paragraph({ spacing: { after: 120 } }),

          // 5. ROTEIRO DE AUDITORIA E TESTE PRÁTICO PARA O DOCENTE
          createHeading1('5. ROTEIRO DE AUDITORIA E TESTE PRÁTICO PARA O DOCENTE'),
          createParagraph([
            'Para facilitar a homologação pelo professor avaliador do SENAI-SP, sugere-se a execução do seguinte roteiro prático ordenado:'
          ]),
          createBullet(
            'Passo 1 (Chat Web)',
            'Acesse https://orcamento-na-hora.pages.dev/. Teste a recusa inteligente com dados incompletos (ex: "quanto custa a pintura?"). Em seguida, solicite 6 cômodos de teto no sítio e verifique o cálculo determinístico com 10% de desconto e taxa de deslocamento no Card Comercial Verde.'
          ),
          createBullet(
            'Passo 2 (Bot no Telegram)',
            'No Telegram, abra https://t.me/valdir_pintor_orcamento_bot e envie o comando /start para registrar seu usuário. Conclua o atendimento no chat web informando seu nome e WhatsApp para receber imediatamente a notificação push com o link do cliente.'
          ),
          createBullet(
            'Passo 3 (Painel Admin)',
            'Acesse https://orcamento-na-hora.pages.dev/admin.html. Na tela de login, insira usuário "admin" e senha "admin". Verifique a consolidação dos KPIs em tempo real (Faturamento, Ticket Médio e Total de Leads) e acione o botão com link direto para o WhatsApp.'
          ),

          new Paragraph({ spacing: { before: 180, after: 60 } }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Documento homologado e em total conformidade com a folha de atividade prática oficial do SENAI-SP.',
                italics: true,
                color: COLOR.MUTED_GRAY,
                size: 19,
                font: 'Segoe UI',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, 'RELATORIO_ENTREGA.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log(`[generate_docx] Documento oficial gerado com sucesso: ${outputPath} (${buffer.length} bytes)`);
}

buildRelatorioDocx().catch((err) => {
  console.error('[generate_docx] Erro ao gerar documento:', err);
  process.exit(1);
});
