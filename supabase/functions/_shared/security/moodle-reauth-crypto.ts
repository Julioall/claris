const CIPHER_PREFIX = 'v1'
const IV_LENGTH = 12

let cachedKeyPromise: Promise<CryptoKey> | null = null

interface SerializedPayload {
  password: string
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

async function getEncryptionKey(): Promise<CryptoKey> {
  if (!cachedKeyPromise) {
    cachedKeyPromise = (async () => {
      const secret = (Deno.env.get('MOODLE_REAUTH_SECRET') ?? '').trim()
      if (!secret) {
        throw new Error('MOODLE_REAUTH_SECRET is not configured')
      }

      const material = new TextEncoder().encode(secret)
      const hashBuffer = await crypto.subtle.digest('SHA-256', material)

      return await crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt'],
      )
    })()
  }

  return await cachedKeyPromise
}

export async function encryptMoodleReauthPayload(payload: SerializedPayload): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      plaintext,
    ),
  )

  return `${CIPHER_PREFIX}:${encodeBase64(iv)}:${encodeBase64(ciphertext)}`
}

export async function decryptMoodleReauthPayload(ciphertext: string): Promise<SerializedPayload> {
  const [version, encodedIv, encodedCiphertext] = ciphertext.split(':')
  if (version !== CIPHER_PREFIX || !encodedIv || !encodedCiphertext) {
    throw new Error('Unsupported Moodle reauth payload version')
  }

  const key = await getEncryptionKey()
  const iv = decodeBase64(encodedIv)
  const encryptedBytes = decodeBase64(encodedCiphertext)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedBytes,
  )
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as Partial<SerializedPayload>

  if (typeof parsed.password !== 'string' || !parsed.password.trim()) {
    throw new Error('Invalid Moodle reauth payload contents')
  }

  return {
    password: parsed.password,
  }
}
