const CREDENTIALS_KEY = 'auth_remembered'
const CREDENTIALS_VERSION = 1
const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 16
const IV_LENGTH = 12

type StoredCredentials = {
  v: number
  salt: string
  iv: string
  cipher: string
  identifier: string
}

const getDeviceSeed = (): string => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let fingerprint = ''
  if (ctx) {
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillText('fp', 2, 2)
    fingerprint = canvas.toDataURL().slice(-32)
  }
  const parts = [
    navigator.language,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    fingerprint,
  ]
  return parts.join('|')
}

const deriveKey = async (identifier: string, salt: Uint8Array): Promise<CryptoKey> => {
  const seed = `${identifier}:${getDeviceSeed()}`
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(seed),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

const toBase64 = (buffer: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))

const fromBase64 = (str: string): Uint8Array => {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const credentialStorage = {
  async save(identifier: string, password: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const key = await deriveKey(identifier, salt)
    const encoder = new TextEncoder()
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(password),
    )
    const payload: StoredCredentials = {
      v: CREDENTIALS_VERSION,
      salt: toBase64(salt),
      iv: toBase64(iv),
      cipher: toBase64(cipherBuffer),
      identifier,
    }
    window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(payload))
  },

  async load(identifier: string): Promise<string | null> {
    const raw = window.localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    try {
      const payload: StoredCredentials = JSON.parse(raw)
      if (payload.v !== CREDENTIALS_VERSION || payload.identifier !== identifier) return null
      const salt = fromBase64(payload.salt)
      const iv = fromBase64(payload.iv)
      const cipher = fromBase64(payload.cipher)
      const key = await deriveKey(identifier, salt)
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource)
      return new TextDecoder().decode(decrypted)
    } catch {
      return null
    }
  },

  clear(): void {
    window.localStorage.removeItem(CREDENTIALS_KEY)
  },

  hasSaved(): boolean {
    return Boolean(window.localStorage.getItem(CREDENTIALS_KEY))
  },

  getSavedIdentifier(): string | null {
    const raw = window.localStorage.getItem(CREDENTIALS_KEY)
    if (!raw) return null
    try {
      const payload: StoredCredentials = JSON.parse(raw)
      return payload.identifier ?? null
    } catch {
      return null
    }
  },
}
