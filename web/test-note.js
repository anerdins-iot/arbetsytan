const { PrismaClient } = require('./generated/prisma');
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
    console.error("Full error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
