import { PrismaClient } from './generated/prisma/index.js';

const prisma = new PrismaClient();

async function test() {
  try {
    const note = await prisma.note.create({
      data: {
        title: "Test Note",
        content: "This is a test note",
        category: null,
        createdById: "test-user-id-123",
        projectId: null,
      },
    });
    console.log("Note created successfully:", note);
  } catch (err) {
    console.error("Error creating note:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
