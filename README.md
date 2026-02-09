# Finance Cloud

Sistema financeiro pessoal na nuvem, com login, dashboard dark moderno, contas, transacoes, cartoes e alertas.

## Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS (tema dark cards)
- Recharts (graficos)
- Supabase (Auth + Postgres + RLS)

## Funcionalidades do MVP
- Login e cadastro via Supabase Auth
- Contas bancarias (CRUD, arquivar, ajuste de saldo, transferencias)
- Transacoes (receita, despesa, transferencia, ajuste, pagamento de fatura)
- Dashboard com graficos e insights
- Cartoes com limite, fatura atual e prevista
- Alertas in-app de fechamento/vencimento
- Importacao de extratos CSV (preview + dedupe basico)
- Endpoints preparados para ChatGPT e WhatsApp

## 1) Criar projeto no Supabase
1. Crie um projeto no Supabase.
2. No **SQL Editor**, rode o arquivo `supabase.sql`.

## 2) Configurar variaveis de ambiente
Crie `finance-cloud/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
# Opcional (somente server-side):
SUPABASE_SERVICE_ROLE_KEY=
```

## 3) Rodar local
```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## 4) Deploy na Vercel
1. Suba o projeto para o GitHub.
2. Importe na Vercel.
3. Configure as mesmas variaveis de ambiente do `.env.local`.

## Endpoints prontos
- `POST /api/ai/insights` -> resumo e insights com ChatGPT (fallback local se nao tiver key)
- `POST /api/ai/categorize` -> sugestao de categoria por descricao
- `GET/POST /api/whatsapp/webhook` -> webhook para mensagens
- `POST /api/whatsapp/send` -> stub para envio

## Observacoes
- Alertas sao gerados ao entrar no dashboard (futuro: job/cron).
- Importacao CSV usa dedupe simples (data + descricao + valor + conta + tipo).
- Compras no cartao sao transacoes com `card_id`.
- Pagamento de fatura cria transacao `card_payment` na conta bancaria.

Boa evolucao para fase 2:
- OFX/PDF (OCR)
- Categorizacao por IA em batch
- Notificacoes push e WhatsApp
- Jobs via cron/worker
