// Prisma 7 起：
//  1) 连接串不再写在 schema.prisma 的 datasource 块里，改由本文件提供给 CLI；
//  2) Prisma 不再自动加载 .env，需要显式引入 dotenv。
// 运行时连接不走这里，而是由 PrismaClient 通过 driver adapter 建立（见 lib/db.ts）。
import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
})
