import { Router } from "express";
import { db } from "@workspace/db";
import { voiceChatSessionsTable, voiceChatMessagesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth";
import OpenAI, { toFile } from "openai";

const router = Router();

function getOpenAI(): OpenAI | null {
  const apiKey = process.env["OPENAI_API_KEY"] || process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const baseURL = process.env["OPENAI_API_BASE"] || process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL });
}

const POINTS_PER_VOICE_EXCHANGE = 5;

router.get("/voice-chat/sessions", requireAuth, async (req, res) => {
  const user = getUser(req);
  const studentId = req.query["studentId"] ? Number(req.query["studentId"]) : null;

  const targetId = (user.role === "admin" || user.role === "parent") && studentId
    ? studentId
    : user.userId;

  const sessions = await db.select({
    id: voiceChatSessionsTable.id,
    studentId: voiceChatSessionsTable.studentId,
    studentName: usersTable.name,
    messageCount: voiceChatSessionsTable.messageCount,
    pointsEarned: voiceChatSessionsTable.pointsEarned,
    createdAt: voiceChatSessionsTable.createdAt,
    updatedAt: voiceChatSessionsTable.updatedAt,
  }).from(voiceChatSessionsTable)
    .leftJoin(usersTable, eq(voiceChatSessionsTable.studentId, usersTable.id))
    .where(eq(voiceChatSessionsTable.studentId, targetId));

  res.json(sessions);
});

router.post("/voice-chat/sessions", requireAuth, async (req, res) => {
  const user = getUser(req);
  const [session] = await db.insert(voiceChatSessionsTable).values({
    studentId: user.userId,
    messageCount: 0,
    pointsEarned: 0,
  }).returning();

  const [userData] = await db.select({ name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, user.userId));

  res.status(201).json({
    ...session,
    studentName: userData?.name || "",
  });
});

router.get("/voice-chat/sessions/:id", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);

  const [session] = await db.select({
    id: voiceChatSessionsTable.id,
    studentId: voiceChatSessionsTable.studentId,
    studentName: usersTable.name,
    messageCount: voiceChatSessionsTable.messageCount,
    pointsEarned: voiceChatSessionsTable.pointsEarned,
    createdAt: voiceChatSessionsTable.createdAt,
    updatedAt: voiceChatSessionsTable.updatedAt,
  }).from(voiceChatSessionsTable)
    .leftJoin(usersTable, eq(voiceChatSessionsTable.studentId, usersTable.id))
    .where(eq(voiceChatSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const messages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, id))
    .orderBy(voiceChatMessagesTable.createdAt);

  res.json({ ...session, messages });
});

router.post("/voice-chat/sessions/:id/messages", requireAuth, async (req, res) => {
  const sessionId = Number(req.params["id"]);
  const user = getUser(req);
  const { audioBase64, mimeType } = req.body;

  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }

  const openai = getOpenAI();
  let studentTranscript = "";
  let studentAudioUrl: string | null = null;

  if (openai) {
    try {
      const audioBuffer = Buffer.from(audioBase64, "base64");
      const audioFile = await toFile(audioBuffer, "audio.m4a", { type: mimeType || "audio/m4a" });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
      });
      studentTranscript = transcription.text;
    } catch (err) {
      req.log.error({ err }, "Failed to transcribe audio");
      studentTranscript = "[Audio - transcription unavailable]";
    }
  } else {
    studentTranscript = "[Audio message received]";
  }

  // Get previous messages for context
  const previousMessages = await db.select().from(voiceChatMessagesTable)
    .where(eq(voiceChatMessagesTable.sessionId, sessionId))
    .orderBy(voiceChatMessagesTable.createdAt);

  const conversationHistory = previousMessages.slice(-10).map(m => ({
    role: m.role === "student" ? "user" as const : "assistant" as const,
    content: m.transcript,
  }));

  let aiTranscript = "Hello! I am your English tutor. Let us practice together! What would you like to talk about today?";
  let aiAudioUrl: string | null = null;

  if (openai) {
    try {
      const chatResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a friendly and encouraging English language tutor for children (ages 5-18). 
Help students improve their English speaking skills through natural conversation.
Keep responses short (1-3 sentences), encouraging, and age-appropriate.
Gently correct grammar mistakes by modeling correct usage in your response.
Always respond in English. Ask simple questions to keep the conversation going.`,
          },
          ...conversationHistory,
          { role: "user", content: studentTranscript },
        ],
      });
      aiTranscript = chatResponse.choices[0]?.message?.content || aiTranscript;

      // Generate TTS
      const ttsResponse = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: aiTranscript,
      });
      const audioArrayBuffer = await ttsResponse.arrayBuffer();
      aiAudioUrl = `data:audio/mp3;base64,${Buffer.from(audioArrayBuffer).toString("base64")}`;
    } catch (err) {
      req.log.error({ err }, "Failed to get AI response");
    }
  }

  // Save messages
  const [studentMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "student",
    audioUrl: studentAudioUrl,
    transcript: studentTranscript,
  }).returning();

  const [aiMsg] = await db.insert(voiceChatMessagesTable).values({
    sessionId,
    role: "ai",
    audioUrl: aiAudioUrl,
    transcript: aiTranscript,
  }).returning();

  // Update session & award points
  const [currentSession] = await db.select().from(voiceChatSessionsTable)
    .where(eq(voiceChatSessionsTable.id, sessionId));

  await db.update(voiceChatSessionsTable)
    .set({
      messageCount: (currentSession?.messageCount || 0) + 2,
      pointsEarned: (currentSession?.pointsEarned || 0) + POINTS_PER_VOICE_EXCHANGE,
      updatedAt: new Date(),
    })
    .where(eq(voiceChatSessionsTable.id, sessionId));

  const [userData] = await db.select({ totalPoints: usersTable.totalPoints })
    .from(usersTable).where(eq(usersTable.id, user.userId));
  await db.update(usersTable)
    .set({ totalPoints: (userData?.totalPoints || 0) + POINTS_PER_VOICE_EXCHANGE })
    .where(eq(usersTable.id, user.userId));

  res.json({
    studentMessage: studentMsg,
    aiMessage: aiMsg,
    pointsEarned: POINTS_PER_VOICE_EXCHANGE,
  });
});

export default router;
