import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { ArchaeologicalUnit, StratigraphicRelation, ChatMessage, GraphOperation } from '../types';
import { geminiService } from '../services/geminiService';

interface ChatWidgetProps {
  units: ArchaeologicalUnit[];
  relations: StratigraphicRelation[];
  onApplyOperations: (ops: GraphOperation[]) => void;
}

const ChatWidget: React.FC<ChatWidgetProps> = ({ units, relations, onApplyOperations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', content: '您好！我是考古系络图助手。您可以直接告诉我如何修改图表，例如：“添加灰坑 H5，打破 H4”、“删除 H1” 或 “H1 和 H2 是打破关系”。' }
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await geminiService.chatWithGraph(userMsg, units, relations);
      
      if (response) {
        setMessages(prev => [...prev, { role: 'ai', content: response.reply }]);
        if (response.operations && response.operations.length > 0) {
          onApplyOperations(response.operations);
        }
      } else {
        setMessages(prev => [...prev, { role: 'ai', content: '抱歉，我没有理解您的指令，请重试。' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', content: '发生错误，请稍后再试。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xl w-80 h-96 mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
          {/* Header */}
          <div className="bg-gray-800 text-white p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-yellow-400"/>
              <span className="font-medium text-sm">AI 绘图助手</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="hover:text-gray-300">
              <X size={18} />
            </button>
          </div>
          
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-3">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg p-2 text-sm ${msg.role === 'user' ? 'bg-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-800 shadow-sm'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm">
                  <Loader2 size={16} className="animate-spin text-gray-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-2 bg-white border-t border-gray-100 flex gap-2">
            <input
              className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              placeholder="输入指令..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              className="bg-gray-800 text-white p-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center justify-center"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
};

export default ChatWidget;