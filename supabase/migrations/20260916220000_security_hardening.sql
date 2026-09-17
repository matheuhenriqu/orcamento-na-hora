-- ============================================================================
-- PROJETO: O Orçamento na Hora (SENAI-SP)
-- MIGRATION: 20260916220000_security_hardening.sql
-- DESCRIÇÃO: SAST Security Hardening (A1 a A7)
--            - A7: Lockdown estrito de telegram_inscritos para service_role
--            - A1: Tabela profiles vinculada a auth.users com RLS e papéis
--            - A3: Restrição de leitura de orcamentos_leads para admin
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A7: LOCKDOWN DE telegram_inscritos (SERVICE_ROLE ONLY)
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.telegram_inscritos FROM anon, authenticated;
GRANT ALL ON public.telegram_inscritos TO service_role;

DROP POLICY IF EXISTS "Acesso livre service role telegram" ON public.telegram_inscritos;
DROP POLICY IF EXISTS "service_role only" ON public.telegram_inscritos;

CREATE POLICY "service_role only" 
    ON public.telegram_inscritos 
    FOR ALL 
    USING (auth.role() = 'service_role') 
    WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 2. A1: TABELA DE PERFIS DE USUÁRIOS (PROFILES) COM ROLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'pintor' CHECK (role IN ('admin', 'atendente', 'pintor')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.profiles IS 'Perfis de operadores e administradores com controle de acesso baseado em papéis (RBAC)';

-- Habilitar RLS em profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated, service_role;

-- Políticas RLS para profiles
DROP POLICY IF EXISTS "Admins podem gerenciar todos os perfis" ON public.profiles;
CREATE POLICY "Admins podem gerenciar todos os perfis"
    ON public.profiles
    FOR ALL
    USING (
        auth.role() = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR (auth.jwt() ->> 'role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    )
    WITH CHECK (
        auth.role() = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR (auth.jwt() ->> 'role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );

DROP POLICY IF EXISTS "Usuarios autenticados podem ler seu proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios autenticados podem ler seu proprio perfil"
    ON public.profiles
    FOR SELECT
    USING (
        auth.uid() = id
    );

-- ----------------------------------------------------------------------------
-- 3. A3: REFORÇO DE RLS NA TABELA orcamentos_leads (LEITURA APENAS ADMIN)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir leitura de leads apenas para admin" ON public.orcamentos_leads;
CREATE POLICY "Permitir leitura de leads apenas para admin"
    ON public.orcamentos_leads
    FOR SELECT
    USING (
        auth.role() = 'service_role'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
