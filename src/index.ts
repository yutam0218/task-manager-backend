// src/index.ts
import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from '@google/genai'; // ★ 新しいSDKのインポート
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const prisma = new PrismaClient();

// ★ 新しいSDKの初期化 (apiKeyプロパティで指定)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// タスク一覧の取得
app.get('/tasks', async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.task.findMany();
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// タスクの作成
app.post('/tasks', async (req: Request, res: Response) => {
  try {
    const { title, deadline, importance, time_required } = req.body;
    const newTask = await prisma.task.create({
      data: {
        title,
        deadline: new Date(deadline),
        importance,
        time_required,
        // completed はデフォルトで false になるため指定不要です
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
    // TypeScriptの型エラーを回避するために String() で明示的に文字列に変換します
    const taskId = parseInt(String(req.params.id), 10);
    const { completed } = req.body; // true または false を受け取る

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed (真偽値) をリクエストボディに含めてください' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
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
    const { motivation } = req.body;
    
    if (!motivation) {
      return res.status(400).json({ error: 'motivation (やる気) をリクエストボディに含めてください' });
    }

    // 未完了のタスクのみを取得するように変更
    const tasks = await prisma.task.findMany({
      where: {
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

    // ★ 新しいSDKの呼び出し形式に変更し、モデルを gemini-3.5-flash に設定
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    
    // 取得方法も response.text に変更
    const advice = response.text;

    res.json({ advice });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});