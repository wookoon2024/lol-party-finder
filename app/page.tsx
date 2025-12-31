'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [nickname, setNickname] = useState<string>('');
  const [isNickModalOpen, setIsNickModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [parties, setParties] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('모두');

  const categories = ['모두', '솔랭', '자랭', '칼바람', '롤체', '내전'];
  const writeTiers = ['상관없음', '아이언', '브론즈', '실버', '골드', '플래티넘', '에메랄드', '다이아', '마스터+'];

  const [formData, setFormData] = useState({
    category: '솔랭',
    title: '',
    tier: '상관없음',
    max_players: 2,
    discord_room: '솔랭 1번방'
  });

  useEffect(() => {
    const saved = localStorage.getItem('lol_nickname');
    if (!saved) setIsNickModalOpen(true);
    else setNickname(saved);
    fetchParties();

    const channel = supabase
      .channel('lol-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parties' }, () => fetchParties())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members' }, () => fetchParties())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchParties = async () => {
    const { data, error } = await supabase
      .from('parties')
      .select(`*, party_members ( user_nickname )`)
      .order('created_at', { ascending: false });
    if (!error) setParties(data || []);
  };

  const filteredParties = parties.filter(p => filterCat === '모두' ? true : p.category === filterCat);

  const handleCategory = (cat: string) => {
    let max = 5;
    let room = `${cat} 1번방`;
    if (cat === '솔랭') max = 2;
    else if (cat === '내전') { max = 10; room = '내전 대기방'; }
    else if (cat === '롤체') max = 8;
    setFormData({ ...formData, category: cat, max_players: max, discord_room: room });
  };

  const handleSubmit = async () => {
    if (!formData.title) return alert("파티 제목을 입력하세요.");
    const { error } = await supabase.from('parties').insert([{ ...formData, creator_nickname: nickname }]);
    if (!error) setIsCreateModalOpen(false);
  };

  const handleJoin = async (party: any) => {
    if (party.current_players >= party.max_players) return;
    const { error } = await supabase.from('party_members').insert([{ party_id: party.id, user_nickname: nickname }]);
    if (!error) {
      await supabase.from('parties').update({ current_players: party.current_players + 1 }).eq('id', party.id);
    }
  };

  const handleLeave = async (party: any) => {
    const { error } = await supabase.from('party_members').delete().eq('party_id', party.id).eq('user_nickname', nickname);
    if (!error) {
      await supabase.from('parties').update({ current_players: Math.max(1, party.current_players - 1) }).eq('id', party.id);
    }
  };

  // 삭제 기능 (로직 보강)
  const handleDelete = async (partyId: string) => {
    if(!confirm('정말 방을 삭제할 거야?')) return;
    
    // 외래 키 에러 방지를 위해 명시적으로 멤버 먼저 삭제 후 파티 삭제
    await supabase.from('party_members').delete().eq('party_id', partyId);
    const { error } = await supabase.from('parties').delete().eq('id', partyId);
    
    if (error) {
      console.error("삭제 실패:", error);
      alert("삭제 실패했어. 로그 확인해봐.");
    }
  };

  return (
    <main className="min-h-screen bg-[#010a13] text-[#cdbe91] p-4 md:p-8 font-sans selection:bg-[#c89b3c] selection:text-black">
      {/* HEADER (로그아웃 버튼 제거) */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 border-b border-[#1e2328] pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#c89b3c] rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(200,155,60,0.4)]">
             <span className="text-black font-black text-xl">L</span>
          </div>
          <h1 className="text-3xl font-black italic tracking-widest text-[#f0e6d2] uppercase">롤 같이 할래?</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-[#a09b8c] uppercase font-bold tracking-[0.2em]">Registered Admin</p>
            <p className="text-sm font-bold text-[#f0e6d2]">{nickname || 'Unknown'}</p>
          </div>
        </div>
      </div>

      {/* CATEGORY FILTER */}
      <div className="max-w-7xl mx-auto mb-12 flex flex-wrap justify-center gap-4">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`px-8 py-2 text-xs font-black tracking-widest border-b-2 transition-all ${filterCat === c ? 'border-[#c8aa6e] text-[#f0e6d2] bg-[#1e2328]' : 'border-transparent text-[#a09b8c] hover:text-[#f0e6d2] hover:bg-[#0a0e13]'}`}>{c.toUpperCase()}</button>
        ))}
      </div>

      {/* PARTY GRID */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredParties.map((party) => {
          const isJoined = party.party_members?.some((m: any) => m.user_nickname === nickname);
          const isCreator = party.creator_nickname === nickname;

          return (
            <div key={party.id} className="group relative bg-gradient-to-b from-[#091428] to-[#0a0e13] border border-[#1e2328] hover:border-[#c8aa6e] p-6 transition-all duration-300 shadow-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#c8aa6e] to-transparent opacity-30"></div>
              
              <div className="flex justify-between items-start mb-6 font-black uppercase italic tracking-tighter">
                <span className="text-[11px] text-[#c8aa6e]">{party.category}</span>
                <span className="text-[11px] text-[#4666ff]">{party.discord_room}</span>
              </div>

              <h3 className="text-xl font-bold text-[#f0e6d2] mb-6 group-hover:text-[#c89b3c] transition-colors">{party.title}</h3>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#c89b3c]"></div>
                  <span className="text-[11px] text-[#f0e6d2] font-bold tracking-tight">👑 {party.creator_nickname}</span>
                </div>
                <div className="flex flex-wrap gap-2 min-h-[24px]">
                  {party.party_members?.map((m: any, i: number) => (
                    <span key={i} className="text-[10px] bg-[#1e2328] text-[#a09b8c] px-2 py-0.5 border border-[#3c3c41]">{m.user_nickname}</span>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-end border-t border-[#1e2328] pt-6">
                <div className="space-y-1">
                  <p className="text-[9px] text-[#a09b8c] font-black uppercase tracking-widest">{party.tier}</p>
                  <p className="text-2xl font-black text-[#f0e6d2]">{party.current_players} / <span className="text-[#c8aa6e]">{party.max_players}</span></p>
                </div>
                
                {isCreator ? (
                  <button onClick={() => handleDelete(party.id)} className="px-5 py-2 bg-[#1e2328] text-[#ff4646] text-[11px] font-black border border-[#ff4646]/30 hover:bg-[#ff4646] hover:text-white transition uppercase tracking-widest">Delete</button>
                ) : isJoined ? (
                  <button onClick={() => handleLeave(party)} className="px-5 py-2 bg-[#1e2328] text-[#f0e6d2] text-[11px] font-black border border-[#c8aa6e] hover:bg-[#c8aa6e] hover:text-black transition uppercase tracking-widest">Leave</button>
                ) : (
                  <button onClick={() => handleJoin(party)} disabled={party.current_players >= party.max_players} className="px-5 py-2 bg-[#0596ff] text-white text-[11px] font-black hover:bg-[#005a9e] disabled:bg-[#1e2328] disabled:text-[#3c3c41] transition uppercase shadow-[0_0_15px_rgba(5,150,255,0.3)]">Join Party</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setIsCreateModalOpen(true)} className="fixed bottom-10 right-10 w-16 h-16 bg-[#c8aa6e] hover:bg-[#f0e6d2] text-black text-4xl font-light transition-all hover:rotate-90 shadow-[0_0_20px_rgba(200,170,110,0.5)] flex items-center justify-center border-2 border-black z-30">
        +
      </button>

      {/* LOGIN MODAL (초기 닉네임 설정용) */}
      {isNickModalOpen && (
        <div className="fixed inset-0 bg-[#010a13]/95 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          <div className="bg-[#010a13] border border-[#c8aa6e] p-10 max-w-sm w-full shadow-[0_0_50px_rgba(200,170,110,0.2)]">
            <h2 className="text-2xl font-black text-[#f0e6d2] mb-2 italic text-center uppercase tracking-widest">오픈톡 닉네임 작성주세요</h2>
            <div className="w-16 h-[1px] bg-[#c8aa6e] mx-auto mb-8"></div>
            <input className="w-full bg-[#1e2328] border border-[#3c3c41] p-4 text-[#f0e6d2] mb-6 outline-none focus:border-[#c8aa6e] font-bold text-center placeholder:text-[#3c3c41]" placeholder="ENTER NICKNAME" value={nickInput} onChange={(e) => setNickInput(e.target.value)} />
            <button onClick={() => { if(!nickInput.trim()) return; localStorage.setItem('lol_nickname', nickInput); setNickname(nickInput); setIsNickModalOpen(false); }} className="w-full bg-[#c8aa6e] hover:bg-[#f0e6d2] py-4 text-black font-black uppercase tracking-widest transition shadow-lg">Confirm</button>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[#010a13]/90 flex items-center justify-center z-40 p-4 backdrop-blur-sm">
          <div className="bg-[#010a13] border border-[#1e2328] p-8 max-w-md w-full shadow-2xl relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-[#c8aa6e]"></div>
            <h2 className="text-xl font-black text-[#f0e6d2] mb-8 uppercase tracking-tighter italic">Assemble Your Team</h2>
            
            <div className="space-y-6">
              <div className="grid grid-cols-5 gap-1">
                {categories.filter(c => c !== '모두').map(c => (
                  <button key={c} onClick={() => handleCategory(c)} className={`py-2 text-[10px] font-black transition ${formData.category === c ? 'bg-[#c8aa6e] text-black' : 'bg-[#1e2328] text-[#a09b8c]'}`}>{c}</button>
                ))}
              </div>
              
              <div>
                <label className="text-[10px] text-[#a09b8c] font-black mb-3 block uppercase tracking-widest">Select Tier</label>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {writeTiers.map(t => (
                    <button key={t} onClick={() => setFormData({...formData, tier: t})} className={`py-2 border transition ${formData.tier === t ? 'border-[#c8aa6e] text-[#c8aa6e]' : 'border-[#1e2328] text-[#a09b8c]'}`}>{t}</button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-[#a09b8c] font-black uppercase tracking-widest">Room Name</label>
                <input className="bg-[#1e2328] border border-[#3c3c41] p-3 text-sm text-[#f0e6d2] outline-none focus:border-[#c8aa6e]" placeholder="예: 즐겁게 빡겜하실분" onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>

              <div className="flex justify-between items-center p-4 bg-[#0a0e13] border border-[#1e2328]">
                <span className="text-[10px] text-[#a09b8c] font-black uppercase">{formData.category} Room No.</span>
                <select className="bg-transparent text-[#c8aa6e] font-black outline-none cursor-pointer" value={formData.discord_room} onChange={e => setFormData({...formData, discord_room: e.target.value})}>
                  {formData.category === '내전' ? <option value="내전 대기방">내전 대기방</option> : [1,2,3,4,5].map(n => <option key={n} value={`${formData.category} ${n}번방`}>{n}번방</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-10 font-black">
              <button onClick={() => setIsCreateModalOpen(false)} className="py-4 text-[11px] text-[#a09b8c] uppercase border border-[#1e2328] hover:bg-[#1e2328]">Cancel</button>
              <button onClick={handleSubmit} className="py-4 text-[11px] bg-[#c8aa6e] text-black uppercase hover:bg-[#f0e6d2] shadow-[0_0_15px_rgba(200,170,110,0.3)]">Create</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}