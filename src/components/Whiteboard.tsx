import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Rect, Circle, Text, Transformer } from 'react-konva';
import { getSocket, disconnectSocket } from '../services/socket';
import { getAISuggestions } from '../services/gemini';
import api from '../services/api';
import { 
  Pencil, Square, Circle as CircleIcon, Type, 
  Undo, Redo, Save, Sparkles, Share2, 
  ChevronLeft, MousePointer2, Trash2, Eraser
} from 'lucide-react';
import { BoardElement } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Whiteboard() {
  const { id: boardId } = useParams();
  const navigate = useNavigate();
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [history, setHistory] = useState<BoardElement[][]>([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [tool, setTool] = useState<'select' | 'pencil' | 'rect' | 'circle' | 'text' | 'eraser'>('pencil');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [boardName, setBoardName] = useState('Untitled Board');
  const [isEditingName, setIsEditingName] = useState(false);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [selectedColor, setSelectedColor] = useState('#000000');
  
  const stageRef = useRef<any>(null);
  const socket = getSocket();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!boardId) return;

    const fetchBoard = async () => {
      try {
        const { data } = await api.get(`/boards/${boardId}`);
        setElements(data.elements || []);
        setBoardName(data.name);
        setHistory([data.elements || []]);
      } catch (err) {
        console.error('Failed to fetch board', err);
        navigate('/dashboard');
      }
    };

    fetchBoard();
    socket.emit('join-board', { boardId, user: currentUser });

    socket.on('element-drawn', (element: BoardElement) => {
      setElements((prev) => [...prev, element]);
    });

    socket.on('element-updated', (updatedElement: BoardElement) => {
      setElements((prev) => prev.map((el) => el.id === updatedElement.id ? updatedElement : el));
    });

    socket.on('presence-update', (users: any[]) => {
      setActiveUsers(users);
    });

    socket.on('board-name-updated', (newName: string) => {
      setBoardName(newName);
    });

    socket.on('element-deleted', (elementId: string) => {
      setElements((prev) => prev.filter((el) => el.id !== elementId));
    });

    socket.on('board-cleared', () => {
      setElements([]);
      setSelectedId(null);
    });

    return () => {
      socket.off('element-drawn');
      socket.off('element-updated');
      socket.off('presence-update');
      socket.off('board-name-updated');
      socket.off('element-deleted');
      socket.off('board-cleared');
    };
  }, [boardId]);

  const handleSaveBoardName = () => {
    setIsEditingName(false);
    socket.emit('update-board-name', { boardId, name: boardName });
  };

  const saveToHistory = (newElements: BoardElement[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const undo = () => {
    if (historyStep > 0) {
      const prevElements = history[historyStep - 1];
      setElements(prevElements);
      setHistoryStep(historyStep - 1);
      socket.emit('save-board', { boardId, elements: prevElements });
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const nextElements = history[historyStep + 1];
      setElements(nextElements);
      setHistoryStep(historyStep + 1);
      socket.emit('save-board', { boardId, elements: nextElements });
    }
  };

  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    if (tool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage();
      if (clickedOnEmpty) {
        setSelectedId(null);
      }
      return;
    }

    setIsDrawing(true);

    if (tool === 'eraser') {
      const elementAtPos = stage.getIntersection(pos);
      if (elementAtPos && elementAtPos.attrs.id) {
        const idToDelete = elementAtPos.attrs.id;
        const newElements = elements.filter(el => el.id !== idToDelete);
        setElements(newElements);
        socket.emit('delete-element', { boardId, elementId: idToDelete });
        saveToHistory(newElements);
        socket.emit('save-board', { boardId, elements: newElements });
      }
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    
    if (tool === 'text') {
      setIsDrawing(false);
      setTimeout(() => {
        const text = window.prompt('Enter text:');
        if (text) {
          const textElement: BoardElement = { 
            id, 
            type: 'text', 
            x: pos.x, 
            y: pos.y, 
            text, 
            stroke: selectedColor, 
            strokeWidth: 2 
          };
          setElements(prev => {
            const next = [...prev, textElement];
            socket.emit('draw-element', { boardId, element: textElement });
            saveToHistory(next);
            socket.emit('save-board', { boardId, elements: next });
            return next;
          });
          setSelectedId(id);
        }
      }, 10);
      return;
    }

    let newElement: BoardElement;
    if (tool === 'pencil') {
      newElement = { id, type: 'line', points: [pos.x, pos.y], stroke: selectedColor, strokeWidth: 2 };
    } else if (tool === 'rect') {
      newElement = { id, type: 'rect', x: pos.x, y: pos.y, width: 0, height: 0, stroke: selectedColor, strokeWidth: 2 };
    } else if (tool === 'circle') {
      newElement = { id, type: 'circle', x: pos.x, y: pos.y, radius: 0, stroke: selectedColor, strokeWidth: 2 };
    } else {
      return;
    }

    setElements([...elements, newElement]);
    setSelectedId(id);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing || tool === 'select') return;

    const stage = e.target.getStage();
    const point = stage.getPointerPosition();

    if (tool === 'eraser') {
      const elementAtPos = stage.getIntersection(point);
      if (elementAtPos && elementAtPos.attrs.id) {
        const idToDelete = elementAtPos.attrs.id;
        setElements(prev => {
          if (!prev.some(el => el.id === idToDelete)) return prev;
          const next = prev.filter(el => el.id !== idToDelete);
          socket.emit('delete-element', { boardId, elementId: idToDelete });
          saveToHistory(next);
          socket.emit('save-board', { boardId, elements: next });
          return next;
        });
      }
      return;
    }

    const lastElement = elements[elements.length - 1];
    if (!lastElement) return;

    if (tool === 'pencil') {
      lastElement.points = lastElement.points!.concat([point.x, point.y]);
    } else if (tool === 'rect') {
      lastElement.width = point.x - lastElement.x!;
      lastElement.height = point.y - lastElement.y!;
    } else if (tool === 'circle') {
      const dx = point.x - lastElement.x!;
      const dy = point.y - lastElement.y!;
      lastElement.radius = Math.sqrt(dx * dx + dy * dy);
    }

    setElements([...elements.slice(0, -1), lastElement]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (tool === 'eraser') return;
    const lastElement = elements[elements.length - 1];
    if (!lastElement) return;
    socket.emit('draw-element', { boardId, element: lastElement });
    saveToHistory(elements);
    socket.emit('save-board', { boardId, elements });
  };

  const handleTransformEnd = (e: any) => {
    const node = e.target;
    const updatedElement = elements.find((el) => el.id === selectedId);
    if (updatedElement) {
      updatedElement.x = node.x();
      updatedElement.y = node.y();
      updatedElement.rotation = node.rotation();
      if (updatedElement.type === 'rect') {
        updatedElement.width = node.width() * node.scaleX();
        updatedElement.height = node.height() * node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
      } else if (updatedElement.type === 'circle') {
        updatedElement.radius = node.radius() * node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
      }
      setElements(elements.map((el) => el.id === selectedId ? updatedElement : el));
      socket.emit('update-element', { boardId, element: updatedElement });
      saveToHistory(elements);
      socket.emit('save-board', { boardId, elements });
    }
  };

  const deleteSelected = () => {
    if (selectedId) {
      const newElements = elements.filter((el) => el.id !== selectedId);
      setElements(newElements);
      socket.emit('delete-element', { boardId, elementId: selectedId });
      setSelectedId(null);
      saveToHistory(newElements);
      socket.emit('save-board', { boardId, elements: newElements });
    }
  };

  const clearBoard = () => {
    // Direct clear without confirm to ensure it works in all environments
    setElements([]);
    setSelectedId(null);
    saveToHistory([]);
    socket.emit('clear-board', boardId);
    socket.emit('save-board', { boardId, elements: [] });
  };

  const handleAISuggestions = async () => {
    setLoadingAI(true);
    const suggestions = await getAISuggestions(elements);
    if (suggestions.length > 0) {
      const newElements = [...elements, ...suggestions];
      setElements(newElements);
      saveToHistory(newElements);
      socket.emit('save-board', { boardId, elements: newElements });
      // Emit each new element to others
      suggestions.forEach(el => socket.emit('draw-element', { boardId, element: el }));
    }
    setLoadingAI(false);
  };

  return (
    <div className="h-screen flex flex-col bg-stone-100 overflow-hidden">
      {/* Toolbar Top */}
      <header className="bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-stone-600" />
          </button>
          <div className="h-6 w-px bg-stone-200" />
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input 
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  onBlur={handleSaveBoardName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveBoardName()}
                  autoFocus
                  className="text-lg font-bold text-stone-900 bg-stone-50 border border-stone-200 rounded px-2 py-0.5 focus:ring-2 focus:ring-stone-900 outline-none w-48"
                />
                <button 
                  onClick={handleSaveBoardName}
                  className="p-1 hover:bg-stone-100 rounded text-stone-600"
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <h2 
                onClick={() => setIsEditingName(true)}
                className="text-lg font-bold text-stone-900 cursor-pointer hover:bg-stone-50 px-2 py-0.5 rounded transition-colors w-48 truncate"
              >
                {boardName}
              </h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-stone-100 p-1 rounded-xl gap-1">
            <ToolButton active={tool === 'select'} onClick={() => setTool('select')} icon={<MousePointer2 className="w-4 h-4" />} label="Select" />
            <ToolButton active={tool === 'pencil'} onClick={() => setTool('pencil')} icon={<Pencil className="w-4 h-4" />} label="Pencil" />
            <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<Eraser className="w-4 h-4" />} label="Eraser" />
            <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')} icon={<Square className="w-4 h-4" />} label="Rectangle" />
            <ToolButton active={tool === 'circle'} onClick={() => setTool('circle')} icon={<CircleIcon className="w-4 h-4" />} label="Circle" />
            <ToolButton active={tool === 'text'} onClick={() => setTool('text')} icon={<Type className="w-4 h-4" />} label="Text" />
          </div>
          
          <div className="h-6 w-px bg-stone-200 mx-2" />
          
          {/* Color Picker */}
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
            {['#000000', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6'].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-all",
                  selectedColor === color ? "border-stone-900 scale-110 shadow-sm" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <input 
              type="color" 
              value={selectedColor} 
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer"
            />
          </div>

          <div className="h-6 w-px bg-stone-200 mx-2" />
          
          <ActionButton onClick={undo} disabled={historyStep === 0} icon={<Undo className="w-4 h-4" />} />
          <ActionButton onClick={redo} disabled={historyStep === history.length - 1} icon={<Redo className="w-4 h-4" />} />
          
          <div className="h-6 w-px bg-stone-200 mx-2" />
          
          <div className="flex gap-1">
            <ActionButton onClick={clearBoard} icon={<Trash2 className="w-4 h-4 text-red-500" />} />
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Active Users */}
          <div className="flex -space-x-2">
            {activeUsers.filter(u => u.id !== currentUser.id).map((user, i) => (
              <div 
                key={i}
                className="w-8 h-8 rounded-full bg-indigo-500 border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-sm"
                title={user.name}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>

          <div className="h-6 w-px bg-stone-200" />

          <button 
            onClick={handleAISuggestions}
            disabled={loadingAI}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <Sparkles className={cn("w-4 h-4", loadingAI && "animate-pulse")} />
            {loadingAI ? 'Thinking...' : 'AI Suggest'}
          </button>
          
          <div className="flex items-center gap-2 bg-stone-50 px-3 py-1.5 rounded-full border border-stone-200">
            <div className="w-6 h-6 rounded-full bg-stone-900 flex items-center justify-center text-white text-[10px] font-bold">
              {currentUser.name?.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-stone-700">{currentUser.name}</span>
          </div>
        </div>
      </header>

      {/* Canvas Area */}
      <main className="flex-1 relative cursor-crosshair bg-white" id="canvas-container">
        <Stage
          width={window.innerWidth}
          height={window.innerHeight - 64}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          ref={stageRef}
        >
          <Layer>
            {elements.map((el, i) => {
              const isSelected = el.id === selectedId;
              if (el.type === 'line') {
                return (
                  <Line
                    key={el.id}
                    id={el.id}
                    points={el.points}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                    tension={0.5}
                    lineCap="round"
                    hitStrokeWidth={20}
                    draggable={tool === 'select'}
                    onClick={() => tool === 'select' && setSelectedId(el.id)}
                    onDragEnd={handleTransformEnd}
                  />
                );
              }
              if (el.type === 'rect') {
                return (
                  <Rect
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                    draggable={tool === 'select'}
                    onClick={() => tool === 'select' && setSelectedId(el.id)}
                    onDragEnd={handleTransformEnd}
                    onTransformEnd={handleTransformEnd}
                  />
                );
              }
              if (el.type === 'circle') {
                return (
                  <Circle
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    radius={el.radius}
                    stroke={el.stroke}
                    strokeWidth={el.strokeWidth}
                    draggable={tool === 'select'}
                    onClick={() => tool === 'select' && setSelectedId(el.id)}
                    onDragEnd={handleTransformEnd}
                    onTransformEnd={handleTransformEnd}
                  />
                );
              }
              if (el.type === 'text') {
                return (
                  <Text
                    key={el.id}
                    id={el.id}
                    x={el.x}
                    y={el.y}
                    text={el.text}
                    fontSize={24}
                    fill={el.stroke}
                    draggable={tool === 'select'}
                    onClick={() => tool === 'select' && setSelectedId(el.id)}
                    onDragEnd={handleTransformEnd}
                  />
                );
              }
              return null;
            })}
            {selectedId && tool === 'select' && (
              <Transformer
                ref={(node) => {
                  if (node && selectedId) {
                    const selectedNode = node.getStage().findOne(`#${selectedId}`);
                    if (selectedNode) {
                      node.nodes([selectedNode]);
                      node.getLayer().batchDraw();
                    }
                  }
                }}
              />
            )}
          </Layer>
        </Stage>

        {/* Current User Badge Bottom Right */}
        <div className="absolute bottom-6 right-6 flex items-center gap-3 bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-stone-200 shadow-lg pointer-events-none">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-stone-900 flex items-center justify-center text-white font-bold">
              {currentUser.name?.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div>
            <p className="text-xs font-bold text-stone-900">{currentUser.name}</p>
            <p className="text-[10px] text-stone-500 uppercase tracking-wider font-medium">Editing Now</p>
          </div>
        </div>
      </main>

      {/* AI Suggestion Toast */}
      <AnimatePresence>
        {loadingAI && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
          >
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span className="font-medium">Gemini is analyzing your board...</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg flex items-center gap-2 transition-all",
        active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900 hover:bg-white/50"
      )}
      title={label}
    >
      {icon}
    </button>
  );
}

function ActionButton({ onClick, disabled, icon }: { onClick: () => void, disabled?: boolean, icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-2 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
    >
      {icon}
    </button>
  );
}
