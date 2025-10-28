import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton
 *
 * Prevents multiple instances in development (hot reload) while creating fresh instances in production.
 * This pattern follows Next.js + Prisma best practices to avoid connection pool exhaustion.
 *
 * @see https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices
 */

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Global Prisma client instance
 *
 * In development: Reuses the same instance across hot reloads (stored on globalThis)
 * In production: Creates a fresh instance for each deployment
 */
export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}
