import type { MoodleFileReference } from './types.ts'

function detectExtension(fileName: string, mimeType: string): string {
  const normalizedName = fileName.toLowerCase()
  const dotIndex = normalizedName.lastIndexOf('.')

  if (dotIndex >= 0 && dotIndex < normalizedName.length - 1) {
    return normalizedName.slice(dotIndex + 1)
  }

  if (mimeType === 'text/plain') return 'txt'
  if (mimeType === 'text/html') return 'html'
  if (mimeType === 'application/pdf') return 'pdf'

  return ''
}

export function getExtensionForFile(fileName: string, mimeType?: string | null): string {
  return detectExtension(fileName, mimeType?.trim() || 'application/octet-stream')
}

export function isFileTypeEnabled(
  fileName: string,
  mimeType: string | null | undefined,
  supportedTypes: string[],
): boolean {
  const normalizedMime = mimeType?.trim().toLowerCase() || 'application/octet-stream'
  const extension = detectExtension(fileName, normalizedMime)

  return supportedTypes.includes(extension) || supportedTypes.includes(normalizedMime)
}

export function buildMoodleFileDownloadUrl(fileUrl: string, token: string): string {
  const normalized = fileUrl.trim()
  const separator = normalized.includes('?') ? '&' : '?'

  if (/[?&]token=/.test(normalized)) {
    return normalized
  }

  return `${normalized}${separator}token=${encodeURIComponent(token)}`
}

export function buildMoodleFileDownloadCandidates(fileUrl: string, token: string): string[] {
  const trimmed = fileUrl.trim()
  const candidates = [
    buildMoodleFileDownloadUrl(trimmed, token),
  ]

  if (trimmed.includes('/pluginfile.php/') && !trimmed.includes('/webservice/pluginfile.php/')) {
    candidates.push(buildMoodleFileDownloadUrl(
      trimmed.replace('/pluginfile.php/', '/webservice/pluginfile.php/'),
      token,
    ))
  }

  if (trimmed.includes('/webservice/pluginfile.php/')) {
    candidates.push(buildMoodleFileDownloadUrl(
      trimmed.replace('/webservice/pluginfile.php/', '/pluginfile.php/'),
      token,
    ))
  }

  return Array.from(new Set(candidates))
}

async function downloadMoodleFile(fileUrl: string, token: string, timeoutMs = 30_000): Promise<Response> {
  const failures: string[] = []
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    for (const candidateUrl of buildMoodleFileDownloadCandidates(fileUrl, token)) {
      let response: Response
      try {
        response = await fetch(candidateUrl, { signal: controller.signal })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('Download do arquivo do Moodle excedeu o tempo limite.')
        }
        failures.push(error instanceof Error ? error.message : 'download_failed')
        continue
      }

      if (response.ok) {
        return response
      }

      failures.push(`HTTP ${response.status}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }

  const failureLabel = failures.length > 0 ? failures.join(' / ') : 'download_failed'
  throw new Error(`Falha ao baixar arquivo do Moodle: ${failureLabel}`)
}

export async function withTemporaryMoodleFile<T>(params: {
  file: MoodleFileReference
  token: string
  maxFileBytes: number
  onDownloaded: (input: {
    bytes: Uint8Array
    mimeType: string
    tempFilePath: string
  }) => Promise<T>
}): Promise<T> {
  if (!params.file.fileurl) {
    throw new Error('Arquivo Moodle sem URL para download.')
  }

  const response = await downloadMoodleFile(params.file.fileurl, params.token)

  const contentLengthHeader = Number(response.headers.get('content-length') ?? '0')
  if (contentLengthHeader > params.maxFileBytes) {
    throw new Error('Arquivo excede o tamanho máximo permitido para análise.')
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > params.maxFileBytes) {
    throw new Error('Arquivo excede o tamanho máximo permitido para análise.')
  }

  const fileName = params.file.filename?.trim() || 'arquivo.tmp'
  const extension = getExtensionForFile(fileName, params.file.mimetype)
  const tempFilePath = await Deno.makeTempFile({
    suffix: extension ? `.${extension}` : '.tmp',
  })

  try {
    await Deno.writeFile(tempFilePath, bytes)

    return await params.onDownloaded({
      bytes,
      mimeType: params.file.mimetype?.trim() || 'application/octet-stream',
      tempFilePath,
    })
  } finally {
    await Deno.remove(tempFilePath).catch(() => undefined)
  }
}
