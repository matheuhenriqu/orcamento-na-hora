-- ============================================================================
-- PROJETO: O Orçamento na Hora (SENAI-SP)
-- SCRIPT DE INICIALIZAÇÃO DO BANCO DE DADOS (SUPABASE POSTGRESQL)
-- ============================================================================

-- Habilitar extensão para geração de UUIDs (se não estiver habilitada)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABELA DE PREÇOS OFICIAIS DO PINTOR
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tabela_precos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo_servico VARCHAR(50) UNIQUE NOT NULL,
    preco_unitario NUMERIC(10, 2) NOT NULL CHECK (preco_unitario > 0),
    observacao TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.tabela_precos IS 'Tabela com os valores oficiais e invioláveis dos serviços de pintura';
COMMENT ON COLUMN public.tabela_precos.tipo_servico IS 'Chave identificadora do serviço (ex: parede_lisa, parede_textura, teto)';
COMMENT ON COLUMN public.tabela_precos.preco_unitario IS 'Preço cobrado por cada cômodo em reais';

-- Inserção dos 3 valores oficiais invioláveis do pintor
-- Parede lisa: R$ 120,00 por cômodo
-- Parede com textura: R$ 180,00 por cômodo
-- Teto: R$ 100,00 por cômodo
INSERT INTO public.tabela_precos (tipo_servico, preco_unitario, observacao)
VALUES 
    ('parede_lisa', 120.00, 'Pintura de parede lisa por cômodo'),
    ('parede_textura', 180.00, 'Pintura de parede com textura por cômodo (maior complexidade/dá mais trabalho)'),
    ('teto', 100.00, 'Pintura de teto por cômodo')
ON CONFLICT (tipo_servico) 
DO UPDATE SET 
    preco_unitario = EXCLUDED.preco_unitario,
    observacao = EXCLUDED.observacao;

-- ============================================================================
-- 2. TABELA DE LEADS / ORÇAMENTOS REGISTRADOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.orcamentos_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(50) NOT NULL,
    tipo_servico VARCHAR(50) NOT NULL,
    quantidade_comodos INTEGER NOT NULL CHECK (quantidade_comodos > 0),
    valor_calculado NUMERIC(10, 2) NOT NULL CHECK (valor_calculado >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.orcamentos_leads IS 'Leads capturados pelo assistente virtual com dados de contato e orçamento';

-- Índices para melhorar consultas e relatórios
CREATE INDEX IF NOT EXISTS idx_orcamentos_leads_created_at ON public.orcamentos_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_leads_telefone ON public.orcamentos_leads (telefone);

-- ============================================================================
-- 3. POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
-- ============================================================================

-- Habilitar RLS em ambas as tabelas
ALTER TABLE public.tabela_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamentos_leads ENABLE ROW LEVEL SECURITY;

-- Políticas para tabela_precos:
-- Leitura pública irrestrita (qualquer usuário/assistente pode consultar preços oficiais)
DROP POLICY IF EXISTS "Permitir leitura publica em tabela_precos" ON public.tabela_precos;
CREATE POLICY "Permitir leitura publica em tabela_precos"
    ON public.tabela_precos
    FOR SELECT
    USING (true);

-- Modificações em tabela_precos restritas apenas ao Service Role (Administrador)
DROP POLICY IF EXISTS "Restringir escrita em tabela_precos para service_role" ON public.tabela_precos;
CREATE POLICY "Restringir escrita em tabela_precos para service_role"
    ON public.tabela_precos
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Políticas para orcamentos_leads:
-- Inserção pública permitida (o assistente ou frontend pode salvar novos leads)
DROP POLICY IF EXISTS "Permitir insercao publica em orcamentos_leads" ON public.orcamentos_leads;
CREATE POLICY "Permitir insercao publica em orcamentos_leads"
    ON public.orcamentos_leads
    FOR INSERT
    WITH CHECK (true);

-- Leitura de leads restrita para usuários autenticados ou service_role (privacidade do cliente)
DROP POLICY IF EXISTS "Permitir leitura de leads apenas para admin" ON public.orcamentos_leads;
CREATE POLICY "Permitir leitura de leads apenas para admin"
    ON public.orcamentos_leads
    FOR SELECT
    USING (auth.role() IN ('authenticated', 'service_role'));

-- ============================================================================
-- 4. CONCESSÃO DE PERMISSÕES AOS ROLES DO SUPABASE (ANON, AUTHENTICATED, SERVICE_ROLE)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Permitir que anon e authenticated possam consultar os preços
GRANT SELECT ON TABLE public.tabela_precos TO anon, authenticated, service_role;

-- Permitir inserção de leads por anon e authenticated
GRANT INSERT, SELECT ON TABLE public.orcamentos_leads TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

