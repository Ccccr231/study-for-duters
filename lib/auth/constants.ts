// 单独放常量：middleware 运行在 Edge，不能连带 import next/headers 或数据库模块。
export const SESSION_COOKIE = 'duters_session'
