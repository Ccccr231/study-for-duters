// 会话：jose 签发 JWT，存 httpOnly Cookie（沿用 PLAN 的 Cookie 方案）。
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/lib/auth/constants'

export { SESSION_COOKIE }
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 天

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET 未配置：复制 .env.example 为 .env 后填写')
  return new TextEncoder().encode(secret)
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey())

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secretKey())
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/** 页面 / Server Action 里取当前用户，未登录返回 null（由调用方决定跳不跳登录）。 */
export async function currentUser() {
  const userId = await getSessionUserId()
  if (!userId) return null

  const { prisma } = await import('@/lib/db')
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, avatarUrl: true },
  })
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>

/** 需要登录的页面用这个：未登录直接跳登录页（redirect 是 never，返回值不会是 null）。 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) redirect('/login')
  return user
}
