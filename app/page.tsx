'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [nickname, setNickname] = useState<string>('');
  const [isNickModalOpen, setIsNickModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [nickInput, setNickInput] = useState('');
  const [customTime, setCustomTime] = useState(''); 
  const [parties, setParties] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('모두');

  const categories = ['모두', '솔랭', '자랭', '칼바람', '롤체', '내전'];
  const writeTiers = ['상관없음', '아이언', '브론즈', '실버', '골드', '플래티넘', '에메랄드', '다이아', '마스터+'];
  const timeOptions = ['즉시 출발', '5분 뒤', '10분 뒤', '30분 뒤', '1시간 뒤', '직접 입력'];

  const theme = {
    '솔랭': { bg: 'bg-cyan-950/40', border: 'border-cyan-500/50', text: 'text-cyan-400', accent: 'bg-cyan-500' },
    '자랭': { bg: 'bg-pink-950/40', border: 'border-pink-500/50', text: 'text-pink-400', accent: 'bg-pink-500' },
    '칼바람': { bg: 'bg-purple-950/40', border: 'border-purple-500/50', text: 'text-purple-400', accent: 'bg-purple-500' },
    '롤체': { bg: 'bg-yellow-950/40', border: 'border-yellow-500/50', text: 'text-yellow-400', accent: 'bg-yellow-500' },
    '내전': { bg: 'bg-emerald-950/40', border: 'border-emerald-500/50', text: 'text-emerald-400', accent: 'bg-emerald-500' },
  };

  const [formData, setFormData] = useState({ 
    category: '솔랭', title: '', tier: '상관없음', max_players: 2, discord_room: '솔랭 1번방', start_time: '즉시 출발' 
  });

  useEffect(() => {
    const saved = localStorage.getItem('lol_nickname');
    if (!saved) setIsNickModalOpen(true);
    else setNickname(saved);
    fetchParties();
    const channel = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parties' }, () => fetchParties())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_members' }, () => fetchParties())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchParties = async () => {
    const { data } = await supabase.from('parties').select(`*, party_members ( user_nickname )`).order('created_at', { ascending: false });
    setParties(data || []);
  };

const getSortedParties = () => {
    // 1. 현재 시간 가져오기
    const now = new Date().getTime();

    const filtered = parties.filter(p => {
      // 카테고리 필터 (기존 로직 유지)
      const isCategoryMatch = filterCat === '모두' ? true : p.category === filterCat;
      
      // 데이터가 없거나 시간이 없으면 통과
      if (!p.created_at) return isCategoryMatch;

      // 2. 시간 파싱 (안전하게 처리)
      const createdAt = new Date(p.created_at).getTime();
      
      // 만약 파싱된 시간이 숫자가 아니면(NaN) 리스트에 표시
      if (isNaN(createdAt)) return isCategoryMatch;

      const isFull = p.current_players >= p.max_players;

      // [계산] 시작 시간 파싱
      let startOffsetMs = 0;
      if (p.start_time?.includes('분 뒤')) {
        startOffsetMs = parseInt(p.start_time) * 60 * 1000;
      } else if (p.start_time?.includes('시간 뒤')) {
        startOffsetMs = parseInt(p.start_time) * 60 * 60 * 1000;
      }

      // [핵심 조건]
      // A. 게임 시작 예정 시각 + 1시간 (여유시간)
      const expireTime = createdAt + startOffsetMs + (60 * 60 * 1000);
      const isExpired = now > expireTime;
      
      // B. 풀방인 경우 생성 후 1시간 지나면 삭제
      const isFullExpired = isFull && (now > createdAt + (60 * 60 * 1000));

      // 디버깅용: 만약 하나도 안 뜨면 아래 return을 "return isCategoryMatch;"로 바꿔서 확인해봐
      return isCategoryMatch && !isExpired && !isFullExpired;
    });

    // 기존 내전 정렬 로직 유지
    const naejeon = filtered.filter(p => p.category === '내전');
    const others = filtered.filter(p => p.category !== '내전');

    return [...naejeon, ...others];
  };

  const handleCategory = (cat: string) => {
    let max = 5;
    let room = `${cat} 1번방`;
    if (cat === '솔랭') max = 2; 
    else if (cat === '내전') { max = 10; room = '내전 대기방'; }
    else if (cat === '롤체') max = 8;
    setFormData({ ...formData, category: cat, max_players: max, discord_room: room });
  };

  const handleSubmit = async () => {
    if (!formData.title) return alert("제목 입력!");
    const finalStartTime = formData.start_time === '직접 입력' ? customTime : formData.start_time;
    if (!finalStartTime) return alert("시간 입력!");

    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert([{ ...formData, start_time: finalStartTime, creator_nickname: nickname, current_players: 1 }])
      .select().single();

    if (partyError) return alert("파티 생성 실패");
    await supabase.from('party_members').insert([{ party_id: newParty.id, user_nickname: nickname }]);
    setIsCreateModalOpen(false);
    setCustomTime('');
  };




  const getRelativeTime = (dateString: string) => {
  const now = new Date();
  const past = new Date(dateString);
  const diffInMs = now.getTime() - past.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

  if (diffInMinutes < 1) return '방금 전';
  if (diffInMinutes < 60) return `${diffInMinutes}분 전`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}시간 전`;
  
  return past.toLocaleDateString();
  };

  const getStartTime = (createdAt: string, startTimeStr: string) => {
  if (startTimeStr === '즉시 출발') return '즉시 출발';
  
  const created = new Date(createdAt);
  let minutesToAdd = 0;

  if (startTimeStr.includes('분 뒤')) {
    minutesToAdd = parseInt(startTimeStr);
  } else if (startTimeStr.includes('시간 뒤')) {
    minutesToAdd = parseInt(startTimeStr) * 60;
  } else {
    return startTimeStr; // "직접 입력" 값은 그대로 반환
  }

  const startAt = new Date(created.getTime() + minutesToAdd * 60000);
  return startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' 시작';
  };


  return (
    <main className="min-h-screen bg-[#020617] text-slate-300 p-4 font-sans">
      <div className="max-w-5xl mx-auto flex justify-between items-center py-0 border-b border-white/5 mb-6">
        <h1 className="text-[16px] font-black text-white tracking-tighter uppercase">롤 파티 구하기</h1>
        <div className="text-[12px] font-bold text-cyan-400 border border-cyan-400/30 px-8 py-1 rounded-md bg-cyan-400/5">{nickname}</div>
      </div>

      <div className="max-w-5xl mx-auto flex gap-2 mb-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filterCat === c ? 'bg-white text-black shadow-lg shadow-white/10' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}>{c}</button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto space-y-3">
        {getSortedParties().map((party) => { // 정렬된 리스트 사용
          const t = theme[party.category as keyof typeof theme] || { bg: 'bg-slate-900/20', border: 'border-white/10', text: 'text-white', accent: 'bg-white' };
          const isJoined = party.party_members?.some((m: any) => m.user_nickname === nickname);
          const isFull = party.current_players >= party.max_players;

          return (
            <div key={party.id} className={`${t.bg} border ${party.category === '내전' ? 'border-emerald-400 shadow-emerald-500/20' : t.border} rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 transition-all hover:border-white/20 shadow-xl relative overflow-hidden`}>
              {/* 내전일 경우 상단 고정 배지 추가 */}
              {party.category === '내전' && (
                <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">PINNED</div>
              )}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[12px] font-black uppercase px-2 py-0.5 rounded ${t.accent} text-black`}>{party.category}</span>
                  <span className="text-[12px] text-white font-black bg-white/10 px-2 rounded border border-white/5">{getStartTime(party.created_at, party.start_time)}</span>
                  <span className="text-[12px] text-slate-400 font-bold">{party.tier}</span>
                  <span className="text-[12px] text-slate-600 border-l border-white/10 pl-2 font-mono uppercase tracking-tighter">{party.discord_room}</span>
                  <span className="text-[11px] text-slate-500 border-l border-white/10 pl-2 font-medium">{getRelativeTime(party.created_at)}</span>
                </div>
                <h3 className="text-[16px] font-bold text-white mb-2">{party.title}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {party.party_members?.map((m: any, i: number) => (
                    <span key={i} className="text-[10px] bg-white/5 text-slate-300 px-1 py-0.5 rounded border border-white/10">{m.user_nickname} {party.creator_nickname === m.user_nickname && '👑'}</span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between md:justify-end gap-0 shrink-0 border-t md:border-t-0 border-white/5 pt-1 md:pt-0">
                <div className="text-[12px] font-black text-white px-1">{party.current_players} / {party.max_players}</div>
                <div className="flex gap-2">
                  {party.creator_nickname === nickname ? (
                    <button onClick={async () => { if(confirm('삭제?')) await supabase.from('parties').delete().eq('id', party.id); }} className="text-[12px] font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20 hover:bg-red-500 hover:text-white transition-all">삭제</button>
                  ) : (
                    <button onClick={async () => {
                      if (isJoined) {
                        await supabase.from('party_members').delete().eq('party_id', party.id).eq('user_nickname', nickname);
                        await supabase.from('parties').update({ current_players: Math.max(1, party.current_players - 1) }).eq('id', party.id);
                      } else if (!isFull) {
                        await supabase.from('party_members').insert([{ party_id: party.id, user_nickname: nickname }]);
                        await supabase.from('parties').update({ current_players: party.current_players + 1 }).eq('id', party.id);
                      }
                    }} 
                    disabled={isFull && !isJoined}
                    className={`text-[12px] font-black px-5 py-1.5 rounded-lg transition-all ${isJoined ? 'bg-slate-700 text-white shadow-inner' : isFull ? 'bg-red-950/20 text-red-500 border border-red-500/20 cursor-not-allowed' : 'bg-white text-black shadow-lg shadow-white/5'}`}>
                      {isJoined ? '떠나기' : isFull ? '풀방' : '참여'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* (모달 코드 등 나머지 200줄 이상 로직 동일하게 유지) */}
      <button onClick={() => setIsCreateModalOpen(true)} className="fixed bottom-8 right-8 w-14 h-14 bg-white text-black rounded-2xl shadow-2xl flex items-center justify-center text-2xl font-bold hover:scale-110 active:scale-95 transition-all z-30 shadow-white/10">+</button>



      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-[#0f172a] border border-white/10 p-6 rounded-2xl max-w-sm w-full shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-[10px] font-black text-white mb-6 uppercase tracking-[0.2em] text-center border-b border-white/5 pb-4 ">방 만들기</h2>
            <div className="space-y-4">
              <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                {categories.filter(c => c !== '모두').map(c => (
                  <button key={c} onClick={() => handleCategory(c)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${formData.category === c ? 'bg-white text-black' : 'bg-white/5 text-slate-500'}`}>{c}</button>
                ))}
              </div>
              
              <div>
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">Start Time</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {timeOptions.map(t => (
                    <button key={t} onClick={() => setFormData({...formData, start_time: t})} className={`py-1.5 rounded-md text-[9px] font-bold border transition-all ${formData.start_time === t ? 'border-white text-white bg-white/5' : 'border-white/5 text-slate-600 hover:bg-white/5'}`}>{t}</button>
                  ))}
                </div>
                {formData.start_time === '직접 입력' && (
                  <input className="w-full mt-2 bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-cyan-400 outline-none focus:border-cyan-500/50" placeholder="예: 8시 30분" value={customTime} onChange={e => setCustomTime(e.target.value)} autoFocus />
                )}
              </div>

              <div>
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">Required Tier</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {writeTiers.map(t => (
                    <button key={t} onClick={() => setFormData({...formData, tier: t})} className={`py-1.5 rounded-md text-[9px] font-bold border transition-all ${formData.tier === t ? 'border-white text-white bg-white/5' : 'border-white/5 text-slate-600'}`}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase ">Discord Room</label>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-400">SELECT ROOM</span>
                  <select className="bg-transparent text-white font-bold outline-none cursor-pointer text-[11px] text-center" value={formData.discord_room} onChange={e => setFormData({...formData, discord_room: e.target.value})}>
                    {formData.category === '내전' ? (
                      <option value="내전 대기방">내전 대기방</option>
                    ) : (
                      [1,2,3,4,5].map(n => <option key={n} className="bg-[#0f172a]" value={`${formData.category} ${n}번방`}>{n}번방</option>)
                    )}
                  </select>
                </div>
              </div>

              <input className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-white/30" placeholder="파티 제목 입력" onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
              <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 text-[10px] font-bold text-slate-500">취소</button>
              <button onClick={handleSubmit} className="flex-1 py-3 text-[10px] bg-white text-black font-black rounded-xl hover:bg-slate-200">확인</button>
            </div>
          </div>
        </div>
      )}

      {isNickModalOpen && (
          /* 배경을 투명도 없는 꽉 찬 검은색(bg-[#020617])으로 설정해서 뒤를 완전히 가림 */
          <div className="fixed inset-0 bg-[#020617] flex items-center justify-center z-[9999]">
            <div className="w-[380px] bg-[#111827] border-white/10 rounded-2xl p-8 shadow-2xl">
      
              <div className="text-center pt-4">
                <h2 className="text-xl font-bold text-white mb-1">닉네임 설정</h2>
                <p className="text-xs text-slate-400 mb-2">예) "홍길동/전라인/골드/서울"인 경우 "홍길동"만 입력</p>
        
                {/* 경고 박스 */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-8">
                  <p className="text-red-400 text-[11px] font-bold leading-5 text-left">
                    ?? 실제 닉네임과 다를 시 <span className="underline">알림 미작동</span><br/>
                    ?? 장난 입력 시 <span className="underline">추후 수정 절대 불가</span>
                  </p>
                </div>

                {/* 입력창: 가독성 높은 박스 형태 */}
                <div className="mb-8">

                  <input 
                    className="w-full bg-[#1f2937] border-2 border-slate-700 rounded-xl px-4 py-4 text-lg text-white outline-none 
                               focus:border-cyan-500 transition-all text-center font-bold placeholder:text-slate-600" 
                    placeholder="오픈톡 닉네임을 입력하세요" 
                    value={nickInput} 
                    onChange={(e) => setNickInput(e.target.value)} 
                    autoFocus 
                  />
                </div>

                <button 
                  onClick={() => { 
                    if(!nickInput.trim()) return alert("닉네임을 입력해주세요!"); 
                    localStorage.setItem('lol_nickname', nickInput); 
                    setNickname(nickInput); 
                    setIsNickModalOpen(false); 
                  }} 
                  className="w-full bg-cyan-500 hover:bg-cyan-400 py-4 rounded-xl text-[#020617] font-black text-base transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
                >
                  입장하기
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}