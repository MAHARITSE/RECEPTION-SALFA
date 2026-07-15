import { useState, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from '../types';
import type { AppState } from '../store';
import { X, Send, MessageCircle, Check } from 'lucide-react';

interface Props { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>>; onClose: () => void; }

export default function Messaging({ state, setState, onClose }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);

  // The sender: either logged-in user or "RECEPTION"
  const senderId = state.currentUser?.id || 'RECEPTION';
  const senderName = state.currentUser?.name || 'RECEPTION';

  // Build user list including RECEPTION as a virtual user
  const receptionUser = { id: 'RECEPTION', name: 'RECEPTION', role: 'receptionist' as const };
  const allChatUsers = senderId === 'RECEPTION'
    ? state.users // reception sees all staff
    : [...state.users.filter((u) => u.id !== senderId), receptionUser]; // staff sees everyone + reception

  const conversations = allChatUsers.map((u: any) => {
    const msgs = state.messages.filter((m) =>
      (m.fromUserId === senderId && m.toUserId === u.id) ||
      (m.fromUserId === u.id && m.toUserId === senderId)
    );
    const unread = msgs.filter((m) => m.toUserId === senderId && !m.read).length;
    return { user: u, messages: msgs, unread };
  }).sort((a, b) => b.unread - a.unread);

  const selectedConv = conversations.find((c: any) => c.user.id === selectedUserId);
  const selectedUser = selectedUserId === 'RECEPTION' ? receptionUser : state.users.find((u) => u.id === selectedUserId);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [selectedConv?.messages.length]);

  // Mark messages as read when opening a conversation
  useEffect(() => {
    if (!selectedUserId) return;
    setState((prev) => ({
      ...prev,
      messages: prev.messages.map((m) =>
        m.fromUserId === selectedUserId && m.toUserId === senderId && !m.read
          ? { ...m, read: true }
          : m
      ),
    }));
  }, [selectedUserId]);

  const handleSend = () => {
    if (!selectedUserId || !newMsg.trim()) return;
    const msg: Message = {
      id: uuidv4(), fromUserId: senderId, fromUserName: senderName,
      toUserId: selectedUserId, toUserName: selectedUser?.name || '',
      content: newMsg.trim(), timestamp: new Date().toISOString(), read: false,
    };
    setState((prev) => ({ ...prev, messages: [...prev.messages, msg] }));
    setNewMsg('');
  };

  const roleLabels: Record<string, string> = {
    doctor: 'Médecin', cashier: 'Caisse', pharmacy: 'Pharmacie',
    magasinier: 'Magasin', laboratory: 'Labo', hospitalization: 'Hospit.', admin: 'Admin',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col" style={{ height: '70vh' }}>
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3 flex justify-between items-center text-white">
          <span className="font-bold flex items-center gap-2"><MessageCircle className="w-5 h-5" /> Messagerie — {senderName}</span>
          <button onClick={onClose} className="hover:bg-white/20 rounded p-1 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Users list */}
          <div className="w-56 border-r border-slate-200 overflow-y-auto bg-slate-50 flex-shrink-0">
            {conversations.map((c) => (
              <div key={c.user.id} onClick={() => setSelectedUserId(c.user.id)}
                className={`p-3 cursor-pointer border-b border-slate-200 transition-colors ${selectedUserId === c.user.id ? 'bg-indigo-100' : 'hover:bg-slate-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{c.user.name}</span>
                  {c.unread > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold flex-shrink-0">{c.unread}</span>}
                </div>
                <div className="text-[10px] text-slate-500">{roleLabels[c.user.role] || c.user.role}</div>
              </div>
            ))}
          </div>

          {/* Chat */}
          <div className="flex-1 flex flex-col min-w-0">
            {!selectedUser ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 p-6 text-center">
                <div><MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Sélectionnez un interlocuteur</p><p className="text-xs mt-1">Les messages arrivent même si la personne est hors ligne</p></div>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex-shrink-0">
                  <span className="font-semibold text-slate-800">{selectedUser.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({roleLabels[selectedUser.role]})</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {selectedConv && selectedConv.messages.length === 0 && <div className="text-center text-slate-400 text-sm py-8">Aucun message</div>}
                  {selectedConv?.messages
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((m) => {
                      const isMe = m.fromUserId === senderId;
                      return (
                        <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] px-3 py-2 rounded-lg text-sm ${isMe ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                            {!isMe && <div className="text-[10px] font-bold mb-0.5 opacity-70">{m.fromUserName}</div>}
                            <p className="break-words">{m.content}</p>
                            <div className={`text-[10px] mt-1 flex items-center gap-1 ${isMe ? 'text-indigo-200 justify-end' : 'text-slate-400'}`}>
                              {new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              {isMe && <Check className={`w-3 h-3 ${m.read ? 'text-green-300' : ''}`} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  <div ref={msgEndRef} />
                </div>
                <div className="p-3 border-t border-slate-200 bg-white flex-shrink-0">
                  <div className="flex gap-2">
                    <input type="text" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="Votre message..." />
                    <button onClick={handleSend} disabled={!newMsg.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 cursor-pointer"><Send className="w-4 h-4" /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
