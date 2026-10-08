import { PrismaClient } from "@prisma/client";
const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const token = "vis-dev-session-token-0123456789abcdef0123456789abcdef";
await db.user.upsert({ where: { id: "owner" }, update: {}, create: { id: "owner", email: "owner@example.test", name: "Owner" } });
await db.session.upsert({ where: { sessionToken: token }, update: { expires: new Date(Date.now() + 7*86400e3) }, create: { userId: "owner", sessionToken: token, expires: new Date(Date.now() + 7*86400e3) } });
const acc = await db.account.findFirst({ where: { userId: "owner", provider: "google" } });
if (!acc) await db.account.create({ data: { userId: "owner", type: "oauth", provider: "google", providerAccountId: "synthetic-owner", access_token: "never-serialize-access", refresh_token: "never-serialize-refresh" } });
console.log("seeded");
await db.$disconnect();
