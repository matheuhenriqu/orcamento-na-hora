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

DROP POLICY IF EXISTS "Acesso livre service role telegram" ON public.telegram_inscritos;
CREATE POLICY "Acesso livre service role telegram" 
    ON public.telegram_inscritos 
    FOR ALL 
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.telegram_inscritos TO anon, authenticated, service_role;
