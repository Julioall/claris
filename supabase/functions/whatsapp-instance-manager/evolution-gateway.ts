import { evolutionRequest } from '../_shared/whatsapp/evolution.ts'

export interface EvolutionInstanceGateway {
  configureWebhook(instanceName: string): Promise<void>
  connect(instanceName: string, phoneNumber: string | null): Promise<void>
  createInstance(instanceName: string, phoneNumber: string | null): Promise<string | null>
  deleteInstance(instanceName: string): Promise<void>
  ensureInstance(instanceName: string, phoneNumber: string | null): Promise<string | null>
  getQrCode(instanceName: string, phoneNumber: string | null): Promise<{
    message: string
    pairingCode: string | null
    pending: boolean
    qrCode: string | null
  }>
  getStatus(instanceName: string): Promise<{
    details: unknown
    state: 'close' | 'connecting' | 'open' | 'unknown'
  }>
  logout(instanceName: string): Promise<void>
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function webhookUrl(): string {
  const publicUrl = normalizeBaseUrl(Deno.env.get('SUPABASE_PUBLIC_URL') ?? '')
  if (publicUrl) return `${publicUrl}/functions/v1/receive-whatsapp-webhook`

  const supabaseUrl = normalizeBaseUrl(Deno.env.get('SUPABASE_URL') ?? '')
  if (!supabaseUrl) return ''
  try {
    if (new URL(supabaseUrl).hostname === 'kong') return ''
  } catch {
    return ''
  }
  return `${supabaseUrl}/functions/v1/receive-whatsapp-webhook`
}

function webhookHeaders(): Record<string, string> {
  const secret = Deno.env.get('WEBHOOK_SECRET') ?? ''
  return secret ? { 'X-Webhook-Secret': secret } : {}
}

function webhookBody(url: string) {
  return {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      headers: webhookHeaders(),
      events: [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'SEND_MESSAGE',
      ],
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function externalId(value: unknown): string | null {
  const id = asRecord(asRecord(value)?.instance)?.instanceId
  return typeof id === 'string' ? id : null
}

function connectPath(instanceName: string, phoneNumber: string | null): string {
  const encodedName = encodeURIComponent(instanceName)
  if (!phoneNumber) return `/instance/connect/${encodedName}`
  return `/instance/connect/${encodedName}?${new URLSearchParams({ number: phoneNumber })}`
}

function readQr(value: unknown): { pairingCode: string | null; qrCode: string | null } {
  const root = asRecord(value)
  const nested = asRecord(root?.qrcode)
  const payload = nested ?? root
  const base64 = payload?.base64
  const code = payload?.code
  const pairingCode = payload?.pairingCode
  return {
    qrCode: typeof base64 === 'string' && base64.trim()
      ? base64
      : typeof code === 'string' && code.trim()
        ? code
        : null,
    pairingCode: typeof pairingCode === 'string' && pairingCode.trim() ? pairingCode : null,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createEvolutionInstanceGateway(): EvolutionInstanceGateway {
  const gateway: EvolutionInstanceGateway = {
    async configureWebhook(instanceName) {
      const url = webhookUrl()
      if (!url) throw new Error('Webhook URL is not configured.')
      await evolutionRequest(`/webhook/set/${encodeURIComponent(instanceName)}`, 'POST', webhookBody(url))
    },

    async createInstance(instanceName, phoneNumber) {
      const result = await evolutionRequest('/instance/create', 'POST', {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        ...(phoneNumber ? { number: phoneNumber } : {}),
      })
      const url = webhookUrl()
      if (url) {
        try {
          await evolutionRequest(
            `/webhook/set/${encodeURIComponent(instanceName)}`,
            'POST',
            webhookBody(url),
          )
        } catch (error) {
          console.warn('Evolution webhook configuration failed.', {
            instanceName,
            message: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
      return externalId(result)
    },

    async ensureInstance(instanceName, phoneNumber) {
      try {
        await evolutionRequest(
          `/instance/connectionState/${encodeURIComponent(instanceName)}`,
          'GET',
        )
        return null
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes('404')) throw error
      }
      return gateway.createInstance(instanceName, phoneNumber)
    },

    async connect(instanceName, phoneNumber) {
      await evolutionRequest(connectPath(instanceName, phoneNumber), 'GET')
    },

    async getStatus(instanceName) {
      const details = await evolutionRequest(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
        'GET',
      )
      const stateValue = asRecord(asRecord(details)?.instance)?.state
      const state = stateValue === 'open' || stateValue === 'close' || stateValue === 'connecting'
        ? stateValue
        : 'unknown'
      return { details, state }
    },

    async getQrCode(instanceName, phoneNumber) {
      let last = { pairingCode: null, qrCode: null } as ReturnType<typeof readQr>
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        last = readQr(await evolutionRequest(connectPath(instanceName, phoneNumber), 'GET'))
        if (last.qrCode || last.pairingCode) {
          return {
            ...last,
            pending: false,
            message: 'QR Code disponível.',
          }
        }
        if (attempt < 6) await sleep(1500)
      }
      return {
        ...last,
        pending: true,
        message: 'A conexão foi iniciada, mas o QR Code ainda não está disponível. Tente novamente em alguns segundos.',
      }
    },

    async logout(instanceName) {
      await evolutionRequest(`/instance/logout/${encodeURIComponent(instanceName)}`, 'DELETE')
    },

    async deleteInstance(instanceName) {
      await evolutionRequest(`/instance/delete/${encodeURIComponent(instanceName)}`, 'DELETE')
    },
  }
  return gateway
}
