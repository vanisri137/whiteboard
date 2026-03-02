import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nexusboard';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose Schemas
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
});

const boardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  elements: { type: Array, default: [] },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Board = mongoose.model('Board', boardSchema);

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticate = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({ email, password: hashedPassword, name });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET);
    res.status(201).json({ user: { id: user._id, email, name }, token });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET);
    res.json({ user: { id: user._id, email, name: user.name }, token });
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// Board Routes
app.get('/api/boards', authenticate, async (req: any, res) => {
  try {
    const boards = await Board.find({ owner: req.user.id }).sort({ updatedAt: -1 });
    res.json(boards);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.post('/api/boards', authenticate, async (req: any, res) => {
  try {
    const { name } = req.body;
    const board = new Board({ name, owner: req.user.id });
    await board.save();
    res.status(201).json(board);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/api/boards/:id', authenticate, async (req: any, res) => {
  try {
    const board = await Board.findById(req.params.id);
    if (!board) return res.status(404).json({ message: 'Board not found' });
    res.json(board);
  } catch (err: any) {
    res.status(400).json({ message: err.message });
  }
});

// Socket.io logic
const boardUsers = new Map<string, Map<string, any>>();

io.on('connection', (socket) => {
  socket.on('join-board', async ({ boardId, user }) => {
    socket.join(boardId);
    
    // Presence tracking
    if (!boardUsers.has(boardId)) {
      boardUsers.set(boardId, new Map());
    }
    boardUsers.get(boardId)!.set(socket.id, user);
    
    // Notify others in the room
    io.to(boardId).emit('presence-update', Array.from(boardUsers.get(boardId)!.values()));

    try {
      const board = await Board.findById(boardId);
      if (board) {
        socket.emit('board-init', board.elements);
      }
    } catch (err) {
      console.error('Error fetching board for init:', err);
    }
  });

  socket.on('update-board-name', async (data) => {
    const { boardId, name } = data;
    try {
      await Board.findByIdAndUpdate(boardId, { name });
      socket.to(boardId).emit('board-name-updated', name);
    } catch (err) {
      console.error('Error updating board name:', err);
    }
  });

  socket.on('draw-element', (data) => {
    const { boardId, element } = data;
    socket.to(boardId).emit('element-drawn', element);
  });

  socket.on('update-element', (data) => {
    const { boardId, element } = data;
    socket.to(boardId).emit('element-updated', element);
  });

  socket.on('delete-element', (data) => {
    const { boardId, elementId } = data;
    socket.to(boardId).emit('element-deleted', elementId);
  });

  socket.on('clear-board', (boardId) => {
    socket.to(boardId).emit('board-cleared');
  });

  socket.on('save-board', async (data) => {
    const { boardId, elements } = data;
    try {
      await Board.findByIdAndUpdate(boardId, { elements });
    } catch (err) {
      console.error('Error saving board:', err);
    }
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (boardUsers.has(room)) {
        boardUsers.get(room)!.delete(socket.id);
        io.to(room).emit('presence-update', Array.from(boardUsers.get(room)!.values()));
      }
    }
  });
});

// Vite middleware for development
if (process.env.NODE_ENV !== 'production') {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
