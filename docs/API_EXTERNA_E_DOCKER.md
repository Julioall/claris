# Weather Pal Guide — Implementação de API Externa + Docker (guia detalhado)

> **Nota importante (para quem quer reaproveitar o padrão):** a **OpenWeatherMap** aparece neste projeto como **exemplo de API externa**.  
> O objetivo aqui é documentar um **padrão recomendado** para consumir **qualquer API externa** com segurança:  
> **Frontend (Vite/React) → Supabase Edge Function (proxy) → API externa**, mantendo **chaves/segredos 100% no servidor** (Edge Function), nunca no browser.

Este documento explica **como este projeto integra uma API externa (OpenWeatherMap) de forma segura** usando **Supabase Edge Functions** e **como o Docker foi adicionado** para rodar o frontend localmente com hot reload.


> Projeto analisado em: `weather-pal-guide-main/`

---

## 1) Visão geral da arquitetura

O fluxo principal é:

```
[React (Vite)]  ->  [Supabase Edge Function: weather-proxy]  ->  [OpenWeatherMap API]
      |                         |
      |                         └─ Lê secret OPENWEATHER_API_KEY (server-side)
      |
      └─ Chama a função via supabase-js: supabase.functions.invoke(...)
```

**Por que isso é importante?**  
A **API key nunca vai para o frontend**. O browser só conversa com a Edge Function, e a Edge Function conversa com a API externa.

---

## 2) Estrutura do projeto (o essencial)

Principais arquivos/pastas que implementam o padrão:

- **Frontend**
  - `src/pages/Weather.tsx` – página principal
  - `src/components/WeatherSearchForm.tsx` – formulário (validação client-side)
  - `src/components/WeatherCard.tsx` – UI do resultado
  - `src/hooks/useWeather.ts` – chamada à Edge Function via React Query
  - `src/types/weather.ts` – tipos TypeScript da resposta

- **Supabase / Edge Function**
  - `supabase/functions/weather-proxy/index.ts` – proxy para OpenWeatherMap

- **Docker (dev local do frontend)**
  - `docker-compose.yml` – sobe o frontend em `localhost:5173`
  - `Dockerfile.frontend` – imagem do frontend (dev server do Vite)

- **Ambiente**
  - `.env.example` – guia de variáveis
  - `.env` – variáveis (neste repo há valores prontos para um projeto supabase remoto)

---

## 2.1) Contrato e responsabilidades (otimizado para agentes de IA)

**Objetivo:** permitir que um agente implemente outra integração externa seguindo o mesmo padrão, sem vazar secrets.

### Interfaces

**Entrada (frontend → Edge Function)**
- Método: `POST`
- Body JSON: `{ "city": "string" }` (exemplo deste projeto)
- Chamada: `supabase.functions.invoke("<function-name>", { body: { ... } })`

**Saída (Edge Function → frontend)**
- Sucesso: `{ "data": <payload_normalizado> }`
- Erro: `{ "error": "mensagem" }` + status HTTP adequado

### Regras de segurança
- **NUNCA** colocar API keys no frontend (`VITE_*`).
- Secrets só via `Deno.env.get("<SECRET_NAME>")` na Edge Function.
- A Edge Function deve implementar **CORS** e responder `OPTIONS` (preflight).

### Onde mudar quando trocar a API externa
- ✅ Muda: `supabase/functions/<nova-funcao>/index.ts` (URL externa, headers, parsing, normalização)
- ✅ Pode mudar: `src/types/*` (tipos do payload normalizado)
- ✅ Pode mudar: `src/hooks/*` (nome da function + tipos)
- ❌ Não muda: padrão de chamada (`supabase.functions.invoke`) e o fato de secrets ficarem no servidor


## 3) Como a API externa foi implementada (OpenWeatherMap)

> **OpenWeatherMap = exemplo.**  
> O que importa para reutilização é o **modelo de integração**: usar uma **Edge Function como proxy** para falar com uma API externa, com **secret no servidor** (`Deno.env.get(...)`) e um **contrato de resposta normalizado** para o frontend.  
> Para trocar a API: você altera somente a Edge Function (URL, headers, payload e normalização) e mantém o frontend chamando `supabase.functions.invoke(...)`.

### 3.1 Frontend: quem “puxa” os dados?

O frontend não chama a OpenWeatherMap diretamente. Ele chama a Edge Function.

#### a) Hook `useWeather` (React Query)

Arquivo: `src/hooks/useWeather.ts`

```ts
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WeatherResponse } from "@/types/weather";

async function fetchWeather(city: string): Promise<WeatherResponse> {
  const { data, error } = await supabase.functions.invoke<WeatherResponse>(
    "weather-proxy",
    { body: { city } }
  );

  if (error) throw new Error(error.message || "Failed to fetch weather data");
  if (data?.error) throw new Error(data.error);

  return data as WeatherResponse;
}

export function useWeather() {
  return useMutation({ mutationFn: fetchWeather });
}
```

**Pontos importantes**
- `supabase.functions.invoke("weather-proxy", ...)` chama a Edge Function `weather-proxy`.
- A function recebe `{ city }` via `body`.
- O hook usa `useMutation`, porque é uma ação “sob demanda” (usuário pesquisa uma cidade).

#### b) Cliente Supabase

Arquivo: `src/integrations/supabase/client.ts`

```ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
```

O frontend depende dessas duas variáveis:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

> Em Vite, variáveis que vão para o client precisam começar com `VITE_`.

---

### 3.2 Backend: Edge Function `weather-proxy` (o “proxy” seguro)

Arquivo: `supabase/functions/weather-proxy/index.ts`

A Edge Function é responsável por:

1. **CORS** (para permitir que o browser chame a função)
2. **validar** o request (`POST` + `city` válido)
3. **ler a API key** do ambiente do servidor: `Deno.env.get("OPENWEATHER_API_KEY")`
4. **chamar a OpenWeatherMap**
5. **normalizar** a resposta para o formato usado pelo frontend

#### a) CORS + preflight

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // ...
});
```

Sem isso, o browser costuma bloquear a chamada por CORS, principalmente em ambiente local.

#### b) Validação do método e do payload

```ts
if (req.method !== "POST") {
  return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const body = await req.json();
const city = body?.city?.trim();

if (!city || typeof city !== "string") {
  return new Response(JSON.stringify({
    error: "City parameter is required and must be a non-empty string.",
  }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

#### c) API key como secret (nunca no client)

```ts
const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
if (!apiKey) {
  return new Response(JSON.stringify({
    error: "Weather service is not configured. Please contact support.",
  }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Esse `OPENWEATHER_API_KEY` deve ser configurado no Supabase como **secret**.

#### d) Chamada externa e tratamento de erros

```ts
const encodedCity = encodeURIComponent(city);
const weatherUrl =
  `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${apiKey}&units=metric&lang=pt_br`;

const weatherResponse = await fetch(weatherUrl);
const weatherData = await weatherResponse.json();

if (!weatherResponse.ok) {
  if (weatherResponse.status === 404) {
    return new Response(JSON.stringify({
      error: `City "${city}" not found. Please check the spelling.`,
    }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (weatherResponse.status === 429) {
    return new Response(JSON.stringify({
      error: "Too many requests. Please try again later.",
    }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    error: "Failed to fetch weather data. Please try again.",
  }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
```

#### e) Normalização (contrato `{ data?, error? }`)

```ts
const response = {
  data: {
    city: weatherData.name,
    country: weatherData.sys?.country || "",
    temperature: Math.round(weatherData.main.temp),
    feelsLike: Math.round(weatherData.main.feels_like),
    humidity: weatherData.main.humidity,
    description: weatherData.weather?.[0]?.description || "N/A",
    icon: weatherData.weather?.[0]?.icon || "01d",
  },
};

return new Response(JSON.stringify(response), {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

O frontend espera exatamente esse formato (tipado em `src/types/weather.ts`).

---

## 4) Como adicionar OUTRA API externa seguindo o mesmo padrão (exemplo completo)

A lógica é sempre:

1. Crie uma nova Edge Function (server)
2. Leia o secret via `Deno.env.get(...)`
3. Faça `fetch` para a API externa
4. Normalize para um contrato claro
5. No frontend, crie um hook com `supabase.functions.invoke("nome-da-funcao")`

### Exemplo: `forecast-proxy` (previsão)

#### 4.1 Edge Function (server-side)
Crie: `supabase/functions/forecast-proxy/index.ts`

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { city } = await req.json();
    if (!city) {
      return new Response(JSON.stringify({ error: "city is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("OPENWEATHER_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "missing OPENWEATHER_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exemplo usando endpoint de forecast (5 dias / 3h)
    const url =
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=pt_br`;

    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok) {
      return new Response(JSON.stringify({ error: data?.message ?? "forecast error" }), {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize o payload para o que você quer usar no UI
    const normalized = {
      data: {
        city: data.city?.name ?? city,
        country: data.city?.country ?? "",
        items: (data.list ?? []).slice(0, 8).map((it: any) => ({
          dt: it.dt,
          temp: Math.round(it.main?.temp),
          desc: it.weather?.[0]?.description ?? "N/A",
          icon: it.weather?.[0]?.icon ?? "01d",
        })),
      },
    };

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

#### 4.2 Hook no frontend
Crie: `src/hooks/useForecast.ts`

```ts
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ForecastResponse = {
  data?: { city: string; country: string; items: Array<{ dt: number; temp: number; desc: string; icon: string }> };
  error?: string;
};

async function fetchForecast(city: string): Promise<ForecastResponse> {
  const { data, error } = await supabase.functions.invoke<ForecastResponse>("forecast-proxy", {
    body: { city },
  });

  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as ForecastResponse;
}

export function useForecast() {
  return useMutation({ mutationFn: fetchForecast });
}
```

---

## 5) Docker: como foi adicionado para rodar localmente

### 5.1 O que o Docker faz aqui?

Este Docker é focado em **desenvolvimento do frontend**:

- Sobe o Vite dev server dentro de um container.
- Faz bind mount do código (`./src`, `./public`, `index.html`) para hot reload.
- Expõe porta `5173`.

> O Supabase local (Postgres, gateway, etc.) é iniciado pelo **Supabase CLI**, fora do compose.

---

### 5.2 `Dockerfile.frontend` (imagem do frontend)

Arquivo: `Dockerfile.frontend`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

**Por que `--host 0.0.0.0`?**  
Para permitir acesso ao Vite dev server de fora do container (mapeamento de porta do Docker).

---

### 5.3 `docker-compose.yml` (serviço frontend + env)

Arquivo: `docker-compose.yml`

Pontos principais do serviço `frontend`:

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_SUPABASE_URL=http://localhost:54321
      - VITE_SUPABASE_PUBLISHABLE_KEY=${SUPABASE_ANON_KEY:-...fallback...}
    volumes:
      - ./src:/app/src:delegated
      - ./public:/app/public:delegated
      - ./index.html:/app/index.html:delegated
      - /app/node_modules
```

**O que isso significa?**
- `VITE_SUPABASE_URL` aponta para o Supabase local (`supabase start` expõe o gateway em `http://localhost:54321`).
- `VITE_SUPABASE_PUBLISHABLE_KEY` vem de `SUPABASE_ANON_KEY` (que você obtém via `supabase status`).
- Volumes montam o código no container e preservam `node_modules` do container para não ser sobrescrito pelo host.

---

## 6) Como rodar tudo localmente (passo a passo)

### Pré-requisitos
- Docker + Docker Compose
- Supabase CLI (instalado e logado)
- Uma API key do OpenWeatherMap

### 6.1 Subir o Supabase local
Em um terminal, na raiz do projeto:

```bash
supabase start
```

Verifique os endpoints e chaves:

```bash
supabase status
```

Você vai ver algo como:
- API: `http://localhost:54321`
- Studio: `http://localhost:54323`
- anon key (use em `SUPABASE_ANON_KEY`)

### 6.2 Configurar a API key como secret (local)

Opção A — usar secrets do Supabase (recomendado):

```bash
supabase secrets set OPENWEATHER_API_KEY="SUA_CHAVE_AQUI"
```

Opção B — servir function com `--env-file` (como o compose sugere)
Crie `.env.local`:

```env
OPENWEATHER_API_KEY=SUA_CHAVE_AQUI
```

### 6.3 Servir a Edge Function localmente

Em outro terminal:

```bash
supabase functions serve weather-proxy --env-file .env.local
```

Isso disponibiliza:
- `http://localhost:54321/functions/v1/weather-proxy`

### 6.4 Subir o frontend via Docker Compose

Em outro terminal:

```bash
docker compose up frontend
```

Acesse:
- Frontend: `http://localhost:5173`
- Supabase Studio: `http://localhost:54323`

---

## 7) Troubleshooting rápido

### CORS
Se aparecer erro de CORS no browser:
- confirme que a function trata `OPTIONS`
- confirme que `corsHeaders` inclui `content-type` e headers do supabase

### 401 / 403 ao chamar functions
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` precisam bater com o Supabase que você está usando (local vs remoto).
- Se estiver local: confirme `supabase start` e use a anon key do `supabase status`.

### Function retornando “Weather service is not configured”
- falta `OPENWEATHER_API_KEY` no ambiente em que a function está rodando.
- se estiver usando `--env-file`, confirme `.env.local` e o nome exato da variável.

---

## 8) Referências internas do projeto

- Edge Function (proxy): `supabase/functions/weather-proxy/index.ts`
- Chamada do frontend: `src/hooks/useWeather.ts`
- Cliente Supabase: `src/integrations/supabase/client.ts`
- Docker: `Dockerfile.frontend`, `docker-compose.yml`
- Variáveis e segurança: `.env.example`, `docs/HANDOFF.md`

---

## 9) Checklist (para garantir que está tudo certo)

- [ ] Frontend **não** possui API keys externas
- [ ] Edge Function lê secret via `Deno.env.get("OPENWEATHER_API_KEY")`
- [ ] CORS + preflight (`OPTIONS`) implementados
- [ ] `supabase start` rodando e `supabase functions serve ...` ativo
- [ ] `docker compose up frontend` expõe `localhost:5173`
- [ ] `.env.local` (ou secrets) configurado com `OPENWEATHER_API_KEY`

