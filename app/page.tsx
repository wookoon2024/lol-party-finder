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
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const theme = {
    '솔랭': { bg: 'bg-cyan-950/40', border: 'border-cyan-500/50', text: 'text-cyan-400', accent: 'bg-cyan-500' },
    '자랭': { bg: 'bg-pink-950/40', border: 'border-pink-500/50', text: 'text-pink-400', accent: 'bg-pink-500' },
    '칼바람': { bg: 'bg-purple-950/40', border: 'border-purple-500/50', text: 'text-purple-400', accent: 'bg-purple-500' },
    '롤체': { bg: 'bg-yellow-950/40', border: 'border-yellow-500/50', text: 'text-yellow-400', accent: 'bg-yellow-500' },
    '내전': { bg: 'bg-emerald-950/40', border: 'border-emerald-500/50', text: 'text-emerald-400', accent: 'bg-emerald-500' },
  };

  // 1. tier를 배열로 변경
  const [formData, setFormData] = useState({ 
    category: '솔랭', title: '', tier: ['상관없음'] as string[], max_players: 2, discord_room: '솔랭 1번방', start_time: '즉시 출발' 
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

  // getSortedParties 로직은 그대로 유지 (tier 표시만 나중에 처리됨)
  const getSortedParties = () => {
    const now = new Date();
    const nowTime = now.getTime();

    const filtered = parties.filter(p => {
      const isCategoryMatch = filterCat === '모두' ? true : p.category === filterCat;
      if (!p.created_at || !isCategoryMatch) return isCategoryMatch;

      const createdAt = new Date(p.created_at).getTime();
      const isFull = p.current_players >= p.max_players;

      let startOffsetMs = 0;
      const sTime = p.start_time || "";

      if (sTime.includes('분 뒤')) {
        startOffsetMs = parseInt(sTime) * 60 * 1000;
      } else if (sTime.includes('시간 뒤')) {
        startOffsetMs = parseInt(sTime) * 60 * 60 * 1000;
      } 
      else if (sTime !== '즉시 출발') {
        const nums = sTime.replace(/[^0-9]/g, '');
        if (nums.length >= 3) {
          const hour = parseInt(nums.length === 3 ? nums.substring(0, 1) : nums.substring(0, 2));
          const min = parseInt(nums.length === 3 ? nums.substring(1) : nums.substring(2));
          if (hour < 24 && min < 60) {
            const targetDate = new Date(p.created_at);
            targetDate.setHours(hour, min, 0, 0);
            if (targetDate.getTime() < createdAt) {
              targetDate.setDate(targetDate.getDate() + 1);
            }
            startOffsetMs = targetDate.getTime() - createdAt;
          }
        }
      }

      const expireTime = createdAt + startOffsetMs + (60 * 60 * 1000);
      const isExpired = nowTime > expireTime;
      const isFullExpired = isFull && (nowTime > createdAt + (60 * 60 * 1000));

      return !isExpired && !isFullExpired;
    });

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

  // 2. 티어 중복 선택 로직 추가
  const handleTierClick = (t: string) => {
    let newTiers = [...formData.tier];
    
    if (t === '상관없음') {
      newTiers = ['상관없음'];
    } else {
      // '상관없음'이 있으면 제거
      newTiers = newTiers.filter(item => item !== '상관없음');
      
      if (newTiers.includes(t)) {
        // 이미 선택되어 있으면 제거 (단, 마지막 하나는 남겨두거나 상관없음으로 복귀)
        newTiers = newTiers.filter(item => item !== t);
        if (newTiers.length === 0) newTiers = ['상관없음'];
      } else {
        // 새로 선택
        newTiers.push(t);
      }
    }
    setFormData({ ...formData, tier: newTiers });
  };

  const handleSubmit = async () => {
    if (!formData.title) return alert("제목 입력!");
    const finalStartTime = formData.start_time === '직접 입력' ? customTime : formData.start_time;
    if (!finalStartTime) return alert("시간 입력!");

    // 저장할 때는 배열을 "골드, 플래티넘" 같은 문자열로 합쳐서 전송
    const tierString = formData.tier.join(', ');

    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert([{ ...formData, tier: tierString, start_time: finalStartTime, creator_nickname: nickname, current_players: 1 }])
      .select().single();

    if (partyError) return alert("파티 생성 실패");
    await supabase.from('party_members').insert([{ party_id: newParty.id, user_nickname: nickname }]);
    setIsCreateModalOpen(false);
    setCustomTime('');
    setFormData({ ...formData, title: '', tier: ['상관없음'] }); // 초기화
  };

  // ... (getRelativeTime, getStartTime 등 기존 헬퍼 함수 유지)
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
    if (startTimeStr.includes('분 뒤')) minutesToAdd = parseInt(startTimeStr);
    else if (startTimeStr.includes('시간 뒤')) minutesToAdd = parseInt(startTimeStr) * 60;
    else return startTimeStr;
    const startAt = new Date(created.getTime() + minutesToAdd * 60000);
    return startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' 시작';
  };

  return (
    <main className="min-h-screen bg-[#020617] text-slate-300 p-4 font-sans">
      <div className="max-w-5xl mx-auto flex justify-between items-center py-0 border-b border-white/5 mb-6">
          <h1 className="text-[16px] font-black text-white tracking-tighter uppercase">롤 파티 구하기</h1>
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-bold text-cyan-400 border border-cyan-400/30 px-4 py-1 rounded-md bg-cyan-400/5">
              {nickname}
            </div>
            {/* 닉네임 재설정 버튼 추가 */}
            <button 
              onClick={() => {
                if(confirm('닉네임을 다시 설정하시겠습니까?')) {
                  localStorage.removeItem('lol_nickname');
                  window.location.reload(); // 새로고침해서 초기 모달 띄움
                }
              }}
              className="text-[10px] font-bold text-slate-500 hover:text-white border border-white/10 px-2 py-1 rounded-md transition-all"
            >
              재설정
            </button>
          </div>
        </div>

      <div className="max-w-5xl mx-auto flex gap-2 mb-2 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(c => (
          <button key={c} onClick={() => setFilterCat(c)} className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filterCat === c ? 'bg-white text-black shadow-lg shadow-white/10' : 'bg-white/5 text-slate-500 hover:bg-white/10'}`}>{c}</button>
        ))}
      </div>

        <div className="max-w-5xl mx-auto space-y-3">
            {getSortedParties().length > 0 ? (
            getSortedParties().map((party) => {
                const t = theme[party.category as keyof typeof theme] || { bg: 'bg-slate-900/20', border: 'border-white/10', text: 'text-white', accent: 'bg-white' };
                const isJoined = party.party_members?.some((m: any) => m.user_nickname === nickname);
                const isFull = party.current_players >= party.max_players;

                return (
                <div key={party.id} className={`${t.bg} border ${party.category === '내전' ? 'border-emerald-400 shadow-emerald-500/20' : t.border} rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-2 transition-all hover:border-white/20 shadow-xl relative overflow-hidden`}>
                    {party.category === '내전' && <div className="absolute top-0 right-0 bg-emerald-500 text-black text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-tighter">PINNED</div>}
          
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
                        <button 
                            onClick={async () => {
                            if (isProcessing) return; 
                            setIsProcessing(party.id);
                            try {
                                if (isJoined) {
                                await supabase.from('party_members').delete().eq('party_id', party.id).eq('user_nickname', nickname);
                                await supabase.from('parties').update({ current_players: Math.max(1, party.current_players - 1) }).eq('id', party.id);
                                } else if (!isFull) {
                                await supabase.from('party_members').insert([{ party_id: party.id, user_nickname: nickname }]);
                                await supabase.from('parties').update({ current_players: party.current_players + 1 }).eq('id', party.id);
                                }
                            } finally {
                                setIsProcessing(null); 
                            }
                            }} 
                            disabled={(isFull && !isJoined) || (isProcessing === party.id)}
                            className={`text-[12px] font-black px-5 py-1.5 rounded-lg transition-all ${isJoined ? 'bg-slate-700 text-white shadow-inner' : isFull ? 'bg-red-950/20 text-red-500 border border-red-500/20 cursor-not-allowed' : 'bg-white text-black shadow-lg shadow-white/5'} ${isProcessing === party.id ? 'opacity-50' : ''}`}>
                            {isProcessing === party.id ? '...' : (isJoined ? '떠나기' : isFull ? '풀방' : '참여')}
                        </button>
                        )}
                    </div>
                    </div>
                </div>
                );
            })
            ) : (
            /* 방 목록이 없을 때 표시할 안내 문구 */
            <div className="mt-1 flex flex-col items-center justify-center min-h-[400px] text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
                <div className="text-4xl mb-4">🎮</div>
                <h3 className="text-white font-bold text-[15px] mb-2">현재 모집 중인 파티가 없습니다.</h3>
                <p className="text-slate-500 text-[12px] leading-6 mb-6">
                  파티는 <span className="text-cyan-400">출발 시간으로부터 1시간</span> 동안 유지됩니다.<br/>
                  직접 방을 만들고 오픈톡 친구들을 초대해 보세요!
                </p>
                <button 
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-white text-black px-2 py-2 rounded-xl text-[12px] font-black hover:scale-105 transition-all shadow-lg shadow-white/5"
                >
                  파티 만들기
                </button>
              </div>
            )}
        </div>

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
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">Required Tier (중복 선택 가능)</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {writeTiers.map(t => (
                    // 3. UI 체크 로직: includes로 변경
                    <button key={t} onClick={() => handleTierClick(t)} className={`py-1.5 rounded-md text-[9px] font-bold border transition-all ${formData.tier.includes(t) ? 'border-white text-white bg-white/10' : 'border-white/5 text-slate-600'}`}>
                      {formData.tier.includes(t) && t !== '상관없음' ? `✓ ${t}` : t}
                    </button>
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

              <input className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-white/30" placeholder="파티 제목 입력" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
              <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 text-[10px] font-bold text-slate-500">취소</button>
              <button onClick={handleSubmit} className="flex-1 py-3 text-[10px] bg-white text-black font-black rounded-xl hover:bg-slate-200">확인</button>
            </div>
          </div>
        </div>
      )}

      {isNickModalOpen && (
          <div className="fixed inset-0 bg-[#020617] flex items-center justify-center z-[9999]">
            <div className="w-[380px] bg-[#111827] border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="text-center pt-4">
                <h2 className="text-xl font-bold text-white mb-1">닉네임 설정</h2>
                <p className="text-xs text-slate-400 mb-2">예) "홍길동/전라인/골드/서울"인 경우 "홍길동"만 입력</p>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-8">
                  <p className="text-red-400 text-[11px] font-bold leading-5 text-left">
                    ⚠️ 실제 닉네임과 다를 시 <span className="underline">알림 미작동</span><br/>
                    ⚠️ 장난 입력 시 <span className="underline">추후 수정 절대 불가</span>
                  </p>
                </div>
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