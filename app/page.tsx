'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [nickname, setNickname] = useState<string>('');
  const [isNickModalOpen, setIsNickModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false); // 개인정보 모달 상태 추가
  const [nickInput, setNickInput] = useState('');
  const [customTime, setCustomTime] = useState(''); 
  const [parties, setParties] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('모두');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [withFriends, setWithFriends] = useState(''); // 지인 닉네임 입력용

  const categories = ['모두', '솔랭', '일반', '자랭', '칼바', '롤체', '내전', '기타'];
  const writeTiers = ['상관없음', '아이언', '브론즈', '실버', '골드', '플래티넘', '에메럴드', '다이아', '마스터+'];
  const timeOptions = ['즉시 출발', '5분 뒤', '10분 뒤', '30분 뒤', '1시간 뒤', '직접 입력'];

  const theme = {
    '솔랭': { bg: 'bg-cyan-950/40', border: 'border-cyan-500/50', text: 'text-cyan-400', accent: 'bg-cyan-500' },
    '자랭': { bg: 'bg-pink-950/40', border: 'border-pink-500/50', text: 'text-pink-400', accent: 'bg-pink-500' },
    '칼바': { bg: 'bg-purple-950/40', border: 'border-purple-500/50', text: 'text-purple-400', accent: 'bg-purple-500' },
    '롤체': { bg: 'bg-yellow-950/40', border: 'border-yellow-500/50', text: 'text-yellow-400', accent: 'bg-yellow-500' },
    '내전': { bg: 'bg-emerald-950/40', border: 'border-emerald-500/50', text: 'text-emerald-400', accent: 'bg-emerald-500' },
    '일반': { bg: 'bg-blue-950/40', border: 'border-blue-500/50', text: 'text-blue-400', accent: 'bg-blue-500' },
    '기타': { bg: 'bg-emerald-950/40', border: 'border-emerald-500/50', text: 'text-emerald-400', accent: 'bg-emerald-500' },
  };

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

  const handleJoinLeave = async (party: any) => {
    if (isProcessing) return;
    setIsProcessing(party.id);
    const isJoined = party.party_members?.some((m: any) => m.user_nickname === nickname);
    const isFull = party.current_players >= party.max_players;

    try {
      if (isJoined) {
        await supabase.from('party_members').delete().eq('party_id', party.id).eq('user_nickname', nickname);
        await supabase.from('parties').update({ current_players: Math.max(1, party.current_players - 1) }).eq('id', party.id);
      } else if (!isFull) {
        await supabase.from('party_members').insert([{ party_id: party.id, user_nickname: nickname }]);
        await supabase.from('parties').update({ current_players: party.current_players + 1 }).eq('id', party.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsProcessing(null), 500);
    }
  };

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
      
      if (sTime.includes('분 뒤')) startOffsetMs = parseInt(sTime) * 60 * 1000;
      else if (sTime.includes('시간 뒤')) startOffsetMs = parseInt(sTime) * 60 * 60 * 1000;
      else if (sTime !== '즉시 출발') {
        const nums = sTime.replace(/[^0-9]/g, '');
        if (nums.length >= 3) {
          const hour = parseInt(nums.substring(0, nums.length === 3 ? 1 : 2));
          const min = parseInt(nums.substring(nums.length === 3 ? 1 : 2));
          const targetDate = new Date(p.created_at);
          targetDate.setHours(hour, min, 0, 0);
          if (targetDate.getTime() < createdAt) targetDate.setDate(targetDate.getDate() + 1);
          startOffsetMs = targetDate.getTime() - createdAt;
        }
      }
      
      const expireTime = createdAt + startOffsetMs + (3 * 60 * 60 * 1000);
      return nowTime <= expireTime && !(isFull && (nowTime > createdAt + (3 * 60 * 60 * 1000)));
    });

    return filtered.sort((a, b) => {
      const aFull = a.current_players >= a.max_players;
      const bFull = b.current_players >= b.max_players;
      if (aFull !== bFull) return aFull ? 1 : -1;
      if (a.category === '내전' && b.category !== '내전') return -1;
      if (a.category !== '내전' && b.category === '내전') return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const handleCategory = (cat: string) => {
    let max = 5;
    let room = `${cat} 1번방`;
    if (cat === '솔랭') max = 2; 
    else if (cat === '내전') { max = 10; room = '내전 대기방'; }
    else if (cat === '롤체') max = 8;
    else if (cat === '일반') max = 5;
    else if (cat === '기타') {
      max = 99;
      room = '자유 대기방';
    }
    setFormData({ ...formData, category: cat, max_players: max, discord_room: room });
  };

  const handleTierClick = (t: string) => {
    let newTiers = [...formData.tier];
    if (t === '상관없음') newTiers = ['상관없음'];
    else {
      newTiers = newTiers.filter(item => item !== '상관없음');
      if (newTiers.includes(t)) {
        newTiers = newTiers.filter(item => item !== t);
        if (newTiers.length === 0) newTiers = ['상관없음'];
      } else newTiers.push(t);
    }
    setFormData({ ...formData, tier: newTiers });
  };

  const handleSubmit = async () => {
    if (!formData.title) return alert("제목 입력!");
    const friendList = withFriends.split(',').map(name => name.trim()).filter(name => name !== "" && name !== nickname); 
    const totalInitialPlayers = 1 + friendList.length;

    if (totalInitialPlayers > formData.max_players) {
      return alert(`최대 인원(${formData.max_players}명)을 초과할 수 없어!`);
    }

    const finalStartTime = formData.start_time === '직접 입력' ? customTime : formData.start_time;
    const tierString = formData.tier.join(', ');

    const { data: newParty, error: partyError } = await supabase
      .from('parties')
      .insert([{ 
        ...formData, 
        tier: tierString, 
        start_time: finalStartTime, 
        creator_nickname: nickname, 
        current_players: totalInitialPlayers 
      }])
      .select().single();

    if (partyError) return alert("파티 생성 실패");

    const allMembers = [
      { party_id: newParty.id, user_nickname: nickname },
      ...friendList.map(name => ({ party_id: newParty.id, user_nickname: name }))
    ];
    await supabase.from('party_members').insert(allMembers);

    setIsCreateModalOpen(false);
    setWithFriends('');
    setCustomTime('');
    setFormData({ ...formData, title: '', tier: ['상관없음'] });
  };

  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const past = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - past.getTime()) / 60000);
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
    <main className="min-h-screen bg-[#020617] text-slate-300 p-4 font-sans relative">
      <div className="max-w-5xl mx-auto flex justify-between items-center py-0 border-b border-white/5 mb-6">
          <h1 className="text-[16px] font-black text-white tracking-tighter uppercase">롤 파티 구하기</h1>
          <div className="flex items-center gap-2">
            <div className="text-[12px] font-bold text-cyan-400 border border-cyan-400/30 px-4 py-1 rounded-md bg-cyan-400/5">{nickname}</div>
            <button onClick={() => { if(confirm('닉네임을 다시 설정하시겠습니까?')) { localStorage.removeItem('lol_nickname'); window.location.reload(); } }} className="text-[10px] font-bold text-slate-500 hover:text-white border border-white/10 px-2 py-1 rounded-md transition-all">재설정</button>
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
            const processingThis = isProcessing === party.id;

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

                <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t md:border-t-0 border-white/5 pt-1 md:pt-0">
                  <div className="text-[12px] font-black text-white">{party.current_players} / {party.max_players}</div>
                  <div className="flex gap-2">
                    {party.creator_nickname === nickname ? (
                      <button onClick={async () => { if(confirm('삭제?')) await supabase.from('parties').delete().eq('id', party.id); }} className="text-[12px] font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20 hover:bg-red-500 hover:text-white transition-all">삭제</button>
                    ) : (
                      <button 
                        onClick={() => handleJoinLeave(party)}
                        disabled={processingThis || (isFull && !isJoined)}
                        className={`text-[12px] font-black px-6 py-1.5 rounded-lg transition-all ${isJoined ? 'bg-slate-700 text-white shadow-inner' : isFull ? 'bg-red-950/20 text-red-500 border border-red-500/20 cursor-not-allowed' : 'bg-white text-black shadow-lg shadow-white/5'} ${processingThis ? 'opacity-50' : ''}`}>
                        {processingThis ? '처리중' : (isJoined ? '떠나기' : isFull ? '풀방' : '참여')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="mt-1 flex flex-col items-center justify-center min-h-[400px] text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
              <div className="text-4xl mb-4">🎮</div>
              <h3 className="text-white font-bold text-[15px] mb-2">현재 모집 중인 파티가 없습니다.</h3>
              <p className="text-slate-500 text-[12px] leading-6 mb-6">파티는 <span className="text-cyan-400">출발 시간으로부터 3시간</span> 동안 유지됩니다.<br/>직접 방을 만들고 오픈톡 친구들을 초대해 보세요!</p>
              <button onClick={() => setIsCreateModalOpen(true)} className="bg-white text-black px-10 py-4 rounded-xl text-[13px] font-black hover:scale-105 transition-all shadow-lg shadow-white/5">파티 만들기</button>
          </div>
        )}
      </div>

      {/* 푸터 영역 - 개인정보처리방침 링크 */}
      <footer className="max-w-5xl mx-auto mt-16 pb-12 border-t border-white/5 pt-8 text-center">
        <button 
          onClick={() => setIsPrivacyOpen(true)}
          className="text-[11px] font-bold text-slate-600 hover:text-slate-300 transition-colors underline underline-offset-4"
        >
          개인정보처리방침
        </button>
        <p className="text-[10px] text-slate-700 mt-2">© 롤 같이 할래 오픈톡방. All rights reserved.</p>
      </footer>

      <button onClick={() => setIsCreateModalOpen(true)} className="fixed bottom-8 right-8 w-14 h-14 bg-white text-black rounded-2xl shadow-2xl flex items-center justify-center text-2xl font-bold hover:scale-110 active:scale-95 transition-all z-30 shadow-white/10">+</button>

{/* 개인정보처리방침 모달 */}
      {isPrivacyOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
          <div className="bg-[#0f172a] border border-white/10 p-6 rounded-2xl max-w-xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2 uppercase tracking-tighter">
              <span className="text-cyan-400">🛡️</span> 개인정보 처리방침
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 text-[12px] leading-6 text-slate-400 space-y-5 font-sans scrollbar-hide">
              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">1. 개인정보의 처리 목적</h3>
                <p>본 서비스는 롤 오픈톡방 파티 매칭 및 사용자 식별, 중복 참여 방지를 위해 최소한의 정보를 수집합니다.</p>
              </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">2. 처리하는 개인정보의 항목</h3>
                {/* 네가 제안한 대로 수정했어 */}
                <p>필수항목: 사용자가 설정한 닉네임</p>
                <p>선택항목: 파티 매칭을 위해 입력하는 최소한의 게임 정보(방 제목, 티어, 시간 등).</p>
              </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">3. 개인정보의 보유 및 이용기간</h3>
                <p>보유기간: 서비스 종료 시까지</p>
              </section>

             <section>
                <h3 className="text-white font-bold text-[13px] mb-1">4. 개인정보의 파기절차 및 방법</h3>
                <p>서비스 운영 종료 또는 수집 목적 달성 시 해당 정보를 지체 없이 파기합니다.</p>
             </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">5. 정보주체의 권리 및 행사방법</h3>
                <p>사용자는 언제든지 본인의 정보를 수정하거나 삭제를 요청할 권리가 있으며, 닉네임 재설정 기능을 통해 즉시 행사할 수 있습니다.</p>
              </section>

             <section>
                <h3 className="text-white font-bold text-[13px] mb-1">6. 개인정보의 안전성 확보 조치</h3>
                <p><strong>기술적 조치:</strong> SSL 암호화 통신(HTTPS)을 적용하여 데이터 전송 구간을 보호합니다.</p>
                <p><strong>관리적 조치:</strong> 데이터베이스 접근 권한을 운영자로 최소화하여 관리하며, 비밀번호 등은 암호화되어 저장됩니다.</p>
              </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">7. 자동 수집 장치의 설치·운영 및 거부</h3>
                <p>본 서비스는 사용자 편의를 위해 브라우저의 '로컬스토리지'를 사용합니다. 이는 브라우저 설정을 통해 거부하거나 삭제할 수 있습니다.</p>
              </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">8. 개인정보 보호책임자 및 상담</h3>
                <p>책임자: "롤 같이 할래" 오픈톡 방장<br/>문의: 카카오톡 오픈채팅방 레인</p>
              </section>

              <section>
                <h3 className="text-white font-bold text-[13px] mb-1">9. 권익침해 구제방법</h3>
                <p>기타 개인정보 침해에 대한 신고나 상담이 필요한 경우 개인정보침해신고센터(privacy.kisa.or.kr)로 문의하시기 바랍니다.</p>
              </section>

              <section className="bg-white/5 p-3 rounded-lg border border-white/5 text-[11px]">
                <p>본 방침은 2026년 1월 1일부터 시행됩니다.</p>
              </section>
            </div>
            <button onClick={() => setIsPrivacyOpen(false)} className="mt-6 w-full py-4 bg-white text-black font-black rounded-xl hover:bg-slate-200 transition-all">확인 및 닫기</button>
          </div>
        </div>
      )}

      {/* 방 만들기 모달 */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-40 p-4">
          <div className="bg-[#0f172a] border border-white/10 p-4 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden">
            <h2 className="text-[12px] font-black text-white mb-3 uppercase tracking-[0.2em] text-center border-b border-white/5 pb-2 ">방 만들기</h2>
            <div className="space-y-2">
              <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
                {categories.filter(c => c !== '모두').map(c => (
                  <button key={c} onClick={() => handleCategory(c)} className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${formData.category === c ? 'bg-white text-black' : 'bg-white/5 text-slate-500'}`}>{c}</button>
                ))}
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">시작시간</label>
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
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">티어설정</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {writeTiers.map(t => (
                    <button key={t} onClick={() => handleTierClick(t)} className={`py-1.5 rounded-md text-[9px] font-bold border transition-all ${formData.tier.includes(t) ? 'border-white text-white bg-white/10' : 'border-white/5 text-slate-600'}`}>
                      {formData.tier.includes(t) && t !== '상관없음' ? `✓ ${t}` : t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] text-slate-500 font-bold mb-2 block uppercase">디스코드 채널</label>
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] font-bold text-slate-400">채널 선택</span>
                  <select 
                    className="bg-transparent text-white font-bold outline-none cursor-pointer text-[11px] text-center" 
                    value={formData.discord_room} 
                    onChange={e => setFormData({...formData, discord_room: e.target.value})}
                  >
                    {formData.category === '내전' ? (
                      <option className="bg-[#0f172a]" value="내전 대기방">내전 대기방</option>
                    ) 
                    : formData.category === '기타' ? (
                      <option className="bg-[#0f172a]" value="자유 대기방">자유 대기방</option>
                    ) 
                    : (
                      [1,2,3,4,5].map(n => (
                        <option key={n} className="bg-[#0f172a]" value={`${formData.category} ${n}번방`}>
                          {n}번방
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              <input 
                className="w-full bg-white/10 border-2 border-cyan-500/30 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-cyan-400 transition-all shadow-inner" 
                placeholder="파티 제목 입력" 
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
              />
            </div>
            <div className="mt-2 space-y-1">
              <input 
                className="w-full bg-white/10 border-2 border-pink-500/30 rounded-xl p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-pink-400 transition-all shadow-inner" 
                placeholder="[함께하는 멤버] 예: 홍길동, 김철수 (쉼표로 구분)" 
                value={withFriends} 
                onChange={e => setWithFriends(e.target.value)} 
              />
            </div>
            <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
              <button onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-3 text-[10px] font-bold text-slate-500">취소</button>
              <button onClick={handleSubmit} className="flex-1 py-3 text-[10px] bg-white text-black font-black rounded-xl hover:bg-slate-200">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 닉네임 설정 모달 */}
      {isNickModalOpen && (
          <div className="fixed inset-0 bg-[#020617] flex items-center justify-center z-[9999]">
            <div className="w-[380px] bg-[#111827] border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="text-center pt-4">
                <h2 className="text-xl font-bold text-white mb-1">닉네임 설정</h2>
                <p className="text-xs text-slate-400 mb-2">오픈톡 닉네임만 입력해줘</p>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-8 text-left text-red-400 text-[11px] font-bold leading-5">
                  ⚠️ 실제 닉네임과 다를 시 알림 미작동<br/>⚠️ 장난 입력 시 추후 수정 절대 불가
                </div>
                <input className="w-full bg-[#1f2937] border-2 border-slate-700 rounded-xl px-4 py-4 text-lg text-white outline-none focus:border-cyan-500 transition-all text-center font-bold mb-8" placeholder="닉네임 입력" value={nickInput} onChange={(e) => setNickInput(e.target.value)} autoFocus />
                <button onClick={() => { if(!nickInput.trim()) return; localStorage.setItem('lol_nickname', nickInput); setNickname(nickInput); setIsNickModalOpen(false); }} className="w-full bg-cyan-500 hover:bg-cyan-400 py-4 rounded-xl text-[#020617] font-black text-base transition-all active:scale-95 shadow-lg shadow-cyan-500/20">입장하기</button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}