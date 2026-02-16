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
3. Em **Storage**, crie o bucket `avatars` como **publico** (ou rode o `supabase.sql` atualizado que ja cria o bucket/policies).

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
# Avatar (upload server-side):
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
# Push notifications (Web Push):
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:alerts@seu-dominio.com
# Email alerts (use one provider or both):
EMAIL_PROVIDER=resend
ALERT_EMAIL_FROM=Finance Cloud <alerts@seu-dominio.com>
RESEND_API_KEY=
BREVO_API_KEY=
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
- `GET/POST /api/alerts-smart/run` -> rotina cron de alertas inteligentes por email
- `GET /api/push/vapid` -> publica configuracao VAPID para registrar push no navegador
- `GET/POST/DELETE /api/push/subscribe` -> lista, cria e remove subscription Web Push por usuario
- `POST /api/push/test` -> envia push de teste para o usuario logado
- `GET /api/insights/latest?limit=6` -> busca insights mais recentes gerados pela automacao
- `GET/POST /api/insights/run` -> executa analise automatica de gastos para o usuario logado
- `GET/POST /api/automations/settings` -> carregar/salvar regras de automacao do usuario
- `GET/POST /api/automations/run` -> executa automacoes (usuario autenticado ou cron)
- `GET /api/banking/relationship/summary` -> score bancario interno + historico + riscos + recomendacoes
- `GET/POST /api/banking/relationship/run` -> recalcula score bancario (usuario autenticado ou cron)
- `GET /api/reports/monthly/summary?month=YYYY-MM` -> resumo mensal de gastos
- `GET /api/reports/monthly/excel?month=YYYY-MM` -> exporta planilha Excel mensal
- `GET /api/reports/monthly/history?limit=12` -> historico dos relatorios enviados
- `POST /api/reports/monthly/email` -> envia relatorio mensal por email com anexo .xlsx
- `GET/POST /api/reports/monthly/run` -> rotina cron mensal de envio de relatorios

## Observacoes
- Alertas inteligentes por email usam cron na Vercel (`/api/alerts-smart/run`) e cooldown de 1h.
- Relatorio mensal automatico roda no cron da Vercel (`/api/reports/monthly/run`) no dia 1.
- Automacoes gerais rodam no cron da Vercel (`/api/automations/run`) e podem ser executadas manualmente no dashboard.
- Relacionamento bancario roda no cron da Vercel (`/api/banking/relationship/run`) com snapshot diario do score.
- Push no navegador precisa de VAPID keys validas e Service Worker ativo (`public/sw.js`).
- Importacao CSV usa dedupe simples (data + descricao + valor + conta + tipo).
- Compras no cartao sao transacoes com `card_id`.
- Pagamento de fatura cria transacao `card_payment` na conta bancaria.

## Seguranca bancaria (checklist)
- Login:
  - Token JWT validado no backend (`src/lib/apiAuth.ts`).
  - Bloqueio de tentativas no login web (5 tentativas, 15 min) em `src/app/page.tsx`.
  - Habilite MFA/2FA no Supabase Auth para codigo por app autenticador.
- API e app:
  - Headers de seguranca ativos em `next.config.ts`.
  - Rate limit global de API via `middleware.ts` + `src/lib/security/rateLimit.ts`.
  - Sanitizacao de input em `src/lib/security/input.ts`.
- Auditoria:
  - Tabela `public.security_events` em `supabase.sql` para eventos de autenticacao e seguranca.
  - RLS habilitado, leitura apenas do proprio usuario.
- Dados financeiros:
  - RLS ativa nas tabelas financeiras.
  - Nao armazenar CVV/senha de cartao; use tokenizacao no provedor de pagamento.
- Backups:
  - Ative backup diario e PITR no Supabase (Project Settings -> Database -> Backups).
  - Teste restore periodicamente em ambiente de homologacao.

Boa evolucao para fase 2:
- OFX/PDF (OCR)
- Categorizacao por IA em batch
- Notificacoes push e WhatsApp
- Jobs via cron/worker
