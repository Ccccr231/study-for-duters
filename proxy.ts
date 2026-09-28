import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE } from '@/lib/auth/constants'

// Next 16.3 起 middleware 文件约定改名为 proxy（middleware.ts 已 deprecated）。
// 只做「有没有有效会话」这道粗筛，不查库（Edge 运行时连不了 Postgres）。
// 细粒度的用户读取在各页面里用 requireUser()。
export default async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const secret = process.env.AUTH_SECRET

  let ok = false
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret))
      ok = true
    } catch {
      ok = false
    }
  }

  if (!ok) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/today/:path*',
    '/plans/:path*',
    '/focus/:path*',
    '/checkin/:path*',
    '/knowledge/:path*',
    '/chat/:path*',
    '/reports/:path*',
    '/settings/:path*',
  ],
}
