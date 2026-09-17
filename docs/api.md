# Especificação da API: O Orçamento na Hora (Edge Functions)

Este documento especifica o contrato unificado de dados (C1), os códigos de erro padronizados e os endpoints das Edge Functions desenvolvidas no Supabase com runtime Deno/TypeScript.

---

## 1. Contrato Padronizado de Resposta (C1)

Todas as requisições retornam JSON com `Content-Type: application/json; charset=utf-8` e o cabeçalho de rastreabilidade `X-Request-Id`.

### Formato de Sucesso (`ok<T>`)
```json
{
  "ok": true,
  "success": true,
  "sucesso": true,
  "data": {
    "exemplo": "conteudo tipado"
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-09-16T22:00:00.000Z",
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

### Formato de Erro (`fail`)
```json
{
  "ok": false,
  "success": false,
  "sucesso": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O campo 'tipo_servico' é obrigatório e deve ser um texto válido.",
    "action": "Informe um dos tipos válidos: parede_lisa, parede_textura ou teto.",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-09-16T22:00:00.000Z"
  },
  "message": "O campo 'tipo_servico' é obrigatório e deve ser um texto válido."
}
```

---

## 2. Tabela de Códigos de Erro (CODE -> Mensagem PT-BR + Ação)

| Código (`code`) | HTTP Status | Descrição Técnica | Mensagem Amigável (PT-BR) | Ação Corretiva Recomendada |
|---|---|---|---|---|
| `EMPTY_MESSAGES` | 400 | Histórico vazio ou inválido | O histórico de mensagens está vazio. | Envie ao menos uma mensagem com a descrição do serviço desejado. |
| `VALIDATION_ERROR` | 400 | Parâmetro obrigatório ausente ou inválido | Informação incompleta ou formato inválido. | Revise os campos preenchidos e tente novamente. Ex: "2 cômodos parede lisa". |
| `INVALID_SERVICE_TYPE` | 400 | Tipo de serviço não reconhecido | Tipo de serviço de pintura não cadastrado. | Escolha uma das opções: Parede Lisa, Parede com Textura ou Teto. |
| `INVALID_PHONE` | 400 | Telefone/WhatsApp com dígitos insuficientes | O número de telefone precisa ter DDD e número válidos. | Informe um WhatsApp com DDD (ex: 11 99999-8888). |
| `WEAK_PASSWORD` | 400 | Senha não atende à política mínima de 12 chars | A senha informada é muito curta ou previsível. | Crie uma senha forte com mínimo de 12 caracteres, maiúscula, minúscula, número e símbolo. |
| `INVALID_ROLE` | 400 | Perfil de usuário inexistente | O perfil de acesso informado é inválido. | Escolha entre Administrador, Atendente ou Pintor. |
| `UNAUTHORIZED` | 401 | JWT inválido, ausente ou sem privilégio admin | Acesso restrito a usuários autorizados. | Faça login no painel com credenciais administrativas válidas. |
| `FORBIDDEN` | 403 | Chave secreta administrativa incorreta | Permissão negada para executar esta operação. | Verifique se a chave de administração fornecida está correta. |
| `RATE_LIMITED` | 429 | Excesso de requisições por janela temporal | Muitas mensagens em pouco tempo. | Aguarde 30 segundos antes de enviar uma nova mensagem. |
| `GROQ_UNAVAILABLE` | 502 | Falha de resposta dos clusters da Groq API | O assistente virtual está temporariamente instável. | Aguarde alguns instantes e clique no botão de reenviar. |
| `GROQ_KEY_MISSING` | 500 | Variável `GROQ_API_KEY` ausente no ambiente | Chave de inteligência artificial não configurada. | Configure a variável GROQ_API_KEY no painel do Supabase. |
| `OFFLINE` | 0 | Falha de rede ou timeout no navegador do cliente | Sem conexão com a internet. | Verifique sua conexão e clique em "Tentar reconectar". |
| `NETWORK_OFFLINE` | 0 | Falha de rede ou timeout no navegador do cliente | Sem conexão com a internet. | Verifique sua conexão e clique em "Tentar de novo". |

---

## 3. Endpoints Disponíveis

### 3.1 `POST /functions/v1/chat`
Processa a conversação via Groq API (Qwen) com Tool Calling automatizado.
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <ANON_KEY>`
  - `Idempotency-Key: <UUID>` *(opcional)*
- **Body**:
  ```json
  {
    "messages": [
      { "role": "user", "content": "Olá, quero orçamento para 2 cômodos de parede lisa." }
    ],
    "context": {
      "ultimo_orcamento": null
    }
  }
  ```
- **Resposta Sucesso (`data`)**:
  ```json
  {
    "reply": "Perfeito! O valor para 2 cômodos de parede lisa é R$ 240,00...",
    "toolAction": {
      "type": "orcamento_calculado",
      "data": { "valor_final": 240.0, "tipo_servico": "parede_lisa", "quantidade_comodos": 2 }
    }
  }
  ```

---

### 3.2 `POST /functions/v1/calcular-orcamento`
Calcula o orçamento oficial inviolável a partir da tabela de preços.
- **Body**:
  ```json
  {
    "tipo_servico": "parede_lisa",
    "quantidade_comodos": 2,
    "taxa_visita": false
  }
  ```
- **Resposta Sucesso (`data.orcamento`)**:
  ```json
  {
    "tipo_servico": "parede_lisa",
    "nome_servico": "Parede Lisa",
    "quantidade_comodos": 2,
    "preco_unitario": 120.0,
    "subtotal": 240.0,
    "desconto_aplicado": 0.0,
    "desconto_percentual": 0,
    "taxa_visita": false,
    "valor_taxa_visita": 0.0,
    "valor_final": 240.0,
    "valor_total_formatado": "R$ 240,00"
  }
  ```

---

### 3.3 `GET /functions/v1/salvar-lead`
Consulta a listagem paginada de leads (protegida para administradores).
- **Query Params**:
  - `page`: Número da página (padrão `1`).
  - `limit`: Quantidade por página (padrão `20`, máx `100`).
  - `q`: Busca textual por nome ou telefone.
  - `tipo`: Filtro por tipo de serviço (`parede_lisa`, `parede_textura`, `teto`).
- **Headers**:
  - `Authorization: Bearer <ADMIN_JWT>` ou `x-admin-key: <ADMIN_SECRET>`
- **Resposta Sucesso (`data.leads` + `meta`)**:
  ```json
  {
    "ok": true,
    "data": {
      "leads": [
        {
          "id": "uuid",
          "nome": "Carlos Silva",
          "telefone": "(11) 98765-4321",
          "tipo_servico": "parede_lisa",
          "quantidade_comodos": 2,
          "valor_calculado": 240.0,
          "created_at": "2026-09-16T21:00:00Z"
        }
      ]
    },
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 35,
      "requestId": "uuid"
    }
  }
  ```

---

### 3.4 `POST /functions/v1/salvar-lead`
Persiste um novo lead ou executa sub-ações administrativas (`create_user`, `list_users`, `delete_user`).
- **Persistência de Lead**:
  ```json
  {
    "nome": "Carlos Silva",
    "telefone": "11987654321",
    "tipo_servico": "parede_lisa",
    "quantidade_comodos": 2
  }
  ```
  *(O valor_calculado é recalculado impreterivelmente pelo servidor).*
- **Sub-ação `create_user`** (requer token administrativo):
  ```json
  {
    "action": "create_user",
    "email": "atendente@valdirpinturas.com.br",
    "password": "SenhaForteSegura2026!",
    "nome": "Mariana Santos",
    "role": "atendente"
  }
  ```

---

### 3.5 `POST /functions/v1/telegram-webhook`
Recebe atualizações enviadas pela API de Webhook do Telegram.
- **Headers**:
  - `x-telegram-bot-api-secret-token`: Token secreto configurado no `setWebhook`.
