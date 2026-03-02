import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { motion } from 'motion/react';
import { Plus, Layout, Clock, LogOut, ChevronRight } from 'lucide-react';
import { Board } from '../types';

export default function Dashboard() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const { data } = await api.get('/boards');
      setBoards(data);
    } catch (err) {
      console.error('Failed to fetch boards', err);
    } finally {
      setLoading(false);
    }
  };

  const createBoard = async () => {
    try {
      const { data } = await api.post('/boards', { name: 'Untitled Board' });
      navigate(`/board/${data._id}`);
    } catch (err) {
      console.error('Failed to create board', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layout className="w-6 h-6 text-stone-900" />
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">WhiteBoard</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-stone-500 hover:text-stone-900 flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </nav>

      <main className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">Your Boards</h2>
            <p className="text-stone-500">Collaborate and create with AI suggestions</p>
          </div>
          <button
            onClick={createBoard}
            className="bg-stone-900 text-white px-6 py-2 rounded-full flex items-center gap-2 hover:bg-stone-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New Board
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
          </div>
        ) : boards.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-dashed border-stone-200">
            <Layout className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-stone-900">No boards yet</h3>
            <p className="text-stone-500 mb-6">Create your first board to start collaborating</p>
            <button
              onClick={createBoard}
              className="text-stone-900 font-bold hover:underline"
            >
              Create Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boards.map((board: any) => (
              <motion.div
                key={board._id}
                whileHover={{ y: -4 }}
                className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                onClick={() => navigate(`/board/${board._id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-stone-100 rounded-xl group-hover:bg-stone-900 group-hover:text-white transition-colors">
                    <Layout className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-stone-900 transition-colors" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 mb-1">{board.name}</h3>
                <div className="flex items-center gap-2 text-stone-400 text-sm">
                  <Clock className="w-4 h-4" />
                  {new Date(board.updatedAt).toLocaleDateString()}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
