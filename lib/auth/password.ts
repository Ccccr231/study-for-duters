// 密码哈希：Node 内置 scrypt，不引入需要原生编译的 bcrypt / argon2。
// 存储格式：`scrypt$<salt-hex>$<key-hex>`
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

const KEY_LEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN)
  return `scrypt$${salt}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hex) return false

  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LEN)
  const expected = Buffer.from(hex, 'hex')
  if (key.length !== expected.length) return false
  return timingSafeEqual(key, expected)
}
