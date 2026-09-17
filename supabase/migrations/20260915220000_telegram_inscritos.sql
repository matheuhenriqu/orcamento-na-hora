-- ============================================================================
-- PROJETO: O Orçamento na Hora (SENAI-SP)
-- MIGRATION: Adicionar tabela telegram_inscritos para Webhook Bidirecional
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_inscritos (
    chat_id BIGINT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.telegram_inscritos IS 'Chats e usuários do Telegram inscritos para receber alertas de novos orçamentos em tempo real';

ALTER TABLE public.telegram_inscritos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.telegram_inscritos FROM anon, authenticated;
GRANT ALL ON public.telegram_inscritos TO service_role;

DROP POLICY IF EXISTS "Acesso livre service role telegram" ON public.telegram_inscritos;
DROP POLICY IF EXISTS "service_role only" ON public.telegram_inscritos;
CREATE POLICY "service_role only" 
    ON public.telegram_inscritos 
    FOR ALL 
    USING (auth.role() = 'service_role') 
    WITH CHECK (auth.role() = 'service_role');

