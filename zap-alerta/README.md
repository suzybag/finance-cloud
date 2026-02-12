# zap-alerta

Bot de WhatsApp com `Baileys` + `Supabase` + `OpenAI (gpt-4o-mini)` para:

- Conectar no WhatsApp via QR Code
- Responder comandos em linguagem natural
- Enviar alerta diario quando faltar X dias para vencimento do cartao
- Receber disparo manual via HTTP (`/enviar-alerta`)

## 1) Instalar

```bash
cd zap-alerta
npm install
```

## 2) Banco (Supabase)

Execute no SQL Editor do Supabase:

- `sql/whatsapp_subscribers.sql`

Esse script cria a tabela `public.whatsapp_subscribers`, indices, trigger de `updated_at` e politica RLS.

## 3) Variaveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
DEFAULT_USER_ID=
DEFAULT_ALERT_DAYS=3
CRON_SCHEDULE=0 9 * * *
CRON_TZ=America/Sao_Paulo
NEXT_ALERTS_ENDPOINT=
NEXT_ALERTS_TOKEN=
BOT_PORT=3100
BOT_HTTP_TOKEN=
DEFAULT_ALERT_PHONE=
LOG_LEVEL=info
```

Notas:

- `DEFAULT_USER_ID` e obrigatorio apenas se voce quiser auto-vincular numero novo.
- `NEXT_ALERTS_ENDPOINT` e opcional. Se vazio, o bot calcula alertas localmente pelo Supabase.
- `BOT_HTTP_TOKEN` protege o endpoint local `POST /enviar-alerta`.
- O bot tenta `OpenAI` primeiro e, se falhar (ex.: quota), cai automaticamente para `Gemini`.

## 4) Rodar

```bash
npm start
```

Ao subir:

- O QR Code aparece no terminal
- Escaneie com seu WhatsApp
- A sessao fica salva em `auth/`
- O cron diario entra em execucao

## 5) Comandos suportados no WhatsApp

- `Quando o cartao Nubank vence?`
- `Me avise quando faltar 3 dias`
- `Qual e minha proxima fatura?`

## 6) Disparo manual via backend

Endpoint local:

- `POST http://localhost:3100/enviar-alerta`
- Header opcional: `x-bot-token: <BOT_HTTP_TOKEN>`

Body:

```json
{
  "phone": "5511999999999",
  "texto": "Aviso: seu cartao vence em 3 dias"
}
```

## 7) Exemplo para Next.js/Vercel

Arquivo de exemplo:

- `examples/next-alerts-route.ts`

Esse endpoint recebe `userId` + `alertDays` e retorna uma lista `alerts[]`.
Use o URL dele em `NEXT_ALERTS_ENDPOINT` para o bot consumir.
