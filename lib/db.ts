// Prisma 7：连接由 driver adapter 建立（schema 里不再写 datasource.url）。
// 用 Proxy 延迟实例化，避免构建期（无 DATABASE_URL 时）一 import 就抛错。
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL 未配置：复制 .env.example 为 .env，填入 Neon 连接串')
  }

  // node-postgres 不解析连接串里的 sslmode，Neon 需要显式开 ssl
  const ssl = /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined

  const adapter = new PrismaPg({ connectionString: url, ssl })
  return new PrismaClient({ adapter })
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient()
  return globalForPrisma.prisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(client(), prop, receiver)
  },
})
