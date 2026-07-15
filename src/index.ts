// src/index.ts
import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// タスク一覧の取得
app.get('/tasks', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'X-User-Id header is required' });
    }

    const tasks = await prisma.task.findMany({
      where: { userId } // 自分(userId)のタスクのみ取得
    });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// タスクの作成
app.post('/tasks', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'X-User-Id header is required' });
    }

    const { title, deadline, importance, time_required } = req.body;
    const newTask = await prisma.task.create({
      data: {
        userId, // タスク作成時にユーザーIDを紐付ける
        title,
        deadline: new Date(deadline),
        importance,
        time_required,
      },
    });
    res.status(201).json(newTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// タスクの完了状態を更新するAPI
app.patch('/tasks/:id/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'X-User-Id header is required' });
    }

    const taskId = parseInt(String(req.params.id), 10);
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed (真偽値) をリクエストボディに含めてください' });
    }

    // 他人のタスクを勝手に更新できないように userId も条件に入れる
    const updatedTask = await prisma.task.update({
      where: { id: taskId, userId: userId },
      data: { completed },
    });
    res.json(updatedTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// やる気に合わせたタスク提案API
app.post('/tasks/advice', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(400).json({ error: 'X-User-Id header is required' });
    }

    const { motivation } = req.body;
    
    if (!motivation) {
      return res.status(400).json({ error: 'motivation (やる気) をリクエストボディに含めてください' });
    }

    // 自分の未完了タスクのみを取得
    const tasks = await prisma.task.findMany({
      where: {
        userId: userId,
        completed: false
      }
    });

    if (tasks.length === 0) {
      return res.json({ advice: '現在登録されている未完了のタスクはありません。素晴らしいです！' });
    }

    const prompt = `
    あなたは優秀なタスク管理アシスタントです。
    以下の未完了タスクリストと、ユーザーの現在の「やる気」を元に、最適なタスクの実行順序を提案してください。

    【ユーザーの現在のやる気】
    ${motivation}

    【未完了タスクリスト（JSON形式）】
    ${JSON.stringify(tasks, null, 2)}

    【指示】
    1. ユーザーのやる気に最も適したタスクの実行順序を提案してください。
    2. なぜその順番にしたのか、理由を簡潔に説明してください。
    3. ユーザーのモチベーションが上がるような励ましのアドバイスを添えてください。
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    
    const advice = response.text;

    res.json({ advice });
  } catch (error: any) {
    console.error(error);
    
    if (error?.status === 503) {
      return res.status(503).json({ error: '現在AIサーバーが混雑しています。しばらく経ってから再度お試しください。' });
    }
    
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});