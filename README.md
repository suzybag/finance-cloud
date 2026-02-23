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
# Security hardening:
APP_ENCRYPTION_KEY= # 32 bytes em base64, hex(64) ou passphrase forte
NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=15
BACKUP_RETENTION_DAYS=30
AUTH_OTP_STRICT_IP=false
SUPABASE_LOW_USAGE_MODE=true
NEXT_PUBLIC_SUPABASE_LOW_USAGE_MODE=true
TRIM_SECURITY_EVENTS_DAYS=14
TRIM_OTP_DAYS=2
TRIM_LOGIN_ATTEMPTS_DAYS=30
TRIM_INSIGHTS_DAYS=120
TRIM_WHATSAPP_DAYS=60
# Push notifications (Web Push):
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:alerts@seu-dominio.com
# Email alerts (use one provider or both):
EMAIL_PROVIDER=resend
ALERT_EMAIL_FROM=Finance Cloud <alerts@seu-dominio.com>
RESEND_FROM=Finance Cloud <alerts@seu-dominio.com>
BREVO_FROM=Finance Cloud <alerts@seu-dominio.com>
RESEND_API_KEY=
BREVO_API_KEY=
```

Observacao importante (Resend):
- `onboarding@resend.dev` (ou `@reenviar.dev`) e apenas para testes e normalmente envia so para o proprio email da conta.
- Para enviar para outros destinatarios, verifique um dominio em `Dominios` no Resend e use esse dominio em `RESEND_FROM`.

## 3) Rodar local
```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## 3.1) Instalar como app no Windows (PWA)
1. Deixe o sistema rodando com `npm run dev` (ou `npm run start` apos build).
2. Abra `http://localhost:3000` no Chrome ou Edge.
3. Clique no icone de instalar app na barra de endereco (ou menu `...` -> `Instalar Finance Cloud`).
4. O app sera instalado no PC e aparecera no Menu Iniciar como aplicativo separado.

Observacao:
- Se instalar usando `localhost`, o app so abre enquanto o servidor local estiver ativo.
- Para usar como app sem depender do terminal, publique na Vercel e instale pelo dominio publicado.

## 4) Deploy na Vercel
1. Suba o projeto para o GitHub.
2. Importe na Vercel.
3. Configure as mesmas variaveis de ambiente do `.env.local`.

## Endpoints prontos
- `POST /api/ai/insights` -> resumo e insights com ChatGPT (fallback local se nao tiver key)
- `POST /api/ai/categorize` -> sugestao de categoria por descricao
- `POST /api/auth/login/start` -> login etapa 1 (senha) + envio de OTP por email
- `POST /api/auth/login/verify-otp` -> login etapa 2 (validacao OTP) + sessao final
- `GET/POST /api/whatsapp/webhook` -> webhook para mensagens
- `POST /api/whatsapp/send` -> stub para envio
- `GET/POST /api/alerts-smart/run` -> rotina cron de alertas inteligentes por email
- `GET/PUT /api/privacy/consent` -> leitura e atualizacao de consentimentos LGPD
- `GET/POST/DELETE /api/open-finance/token` -> cofre tokenizado/criptografado para tokens Open Finance
- `GET/POST /api/backups/daily` -> backup diario criptografado para bucket privado `backups`
- `GET/POST /api/maintenance/supabase-trim` -> limpeza automatica de tabelas/logs para controle de limite
- `GET/POST /api/investments/security/snapshot` -> snapshot criptografado dos investimentos do usuario
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
  - Token JWT validado e expiracao checada no backend (`src/lib/apiAuth.ts` + `src/lib/security/jwt.ts`).
  - 2FA por email OTP no fluxo de login (`/api/auth/login/start` + `/api/auth/login/verify-otp`).
  - Bloqueio server-side apos 5 tentativas (15 min) com auditoria (`public.auth_login_attempts`).
  - Logout automatico por inatividade (`src/components/SessionInactivityGuard.tsx`).
- API e app:
  - Middleware global com HTTPS, CSP, headers, CSRF (origin check) e rate limit (`middleware.ts`).
  - Sanitizacao e validacao forte de input/senha em `src/lib/security/input.ts`.
- Auditoria:
  - Tabela `public.security_events` em `supabase.sql` para eventos de autenticacao e seguranca.
  - Deteccao de login suspeito (mudanca de IP) com alerta por email/push.
  - RLS habilitado, leitura apenas do proprio usuario.
- Dados financeiros:
  - RLS ativa nas tabelas financeiras.
  - Nao armazenar CVV/senha/PIN de cartao (validacao no frontend de cartoes).
  - Tokenizacao e criptografia de tokens Open Finance (`public.open_finance_tokens`).
  - Snapshot criptografado dos investimentos (`public.investment_security_snapshots`).
- Backups:
  - Cron de limpeza roda em `/api/maintenance/supabase-trim` para reduzir consumo de storage/linhas.
  - Cron diario em `/api/backups/daily` com modo economico (`SUPABASE_LOW_USAGE_MODE=true`) para menor custo.
  - Ative tambem backup gerenciado + PITR no Supabase (Project Settings -> Database -> Backups).
  - Teste restore periodicamente em ambiente de homologacao.

Boa evolucao para fase 2:
- OFX/PDF (OCR)
- Categorizacao por IA em batch
- Notificacoes push e WhatsApp
- Jobs via cron/worker
