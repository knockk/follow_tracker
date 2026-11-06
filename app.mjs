import {analyze, COLORS, METRICS, rate, strictSum} from './metrics.mjs';
const $ = s=>document.querySelector(s);
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v,decimals=0)=>v===null||v===undefined?'미수집':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:decimals});
const compact = n=>Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(1)+'k':fmt(n,1);
const unitFmt = (v,unit)=>v==null?'N/A':fmt(v,unit==='%'?2:0)+(unit==='%'?'%':'');
let data, current, state, sort={key:'views',direction:-1};
const allGroups=[];
const color = name=>COLORS[allGroups.indexOf(name)%COLORS.length];
const card = (label,value,note,accent='')=>`<article class="stat-card"><div class="stat-label">${label}<span class="accent">${accent}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`;
function chartMarkup(config,hidden=new Set()) {
  const {title,description,key,unit='',increment=false}=config;
  const series=current.series.filter(s=>!hidden.has(s.name));
  const value=p=>increment?p.increments[key]:p[key];
  const values=series.flatMap(s=>s.points.map(value)).filter(v=>v!==null&&v!==undefined);
  let drawing='';
  if(!values.length) drawing='<div class="chart-empty"><span>표시할 수 있는 기록이 없습니다</span><small>미수집 · 비교 가능한 전일 기록이 없으면 N/A</small></div>';
  else {
    const w=800,h=245,l=57,r=18,t=14,b=38,cw=w-l-r,ch=h-t-b;
    let lo=Math.min(0,...values),hi=Math.max(0,...values);if(lo===hi)hi=lo+1;
    const y=v=>t+ch-(v-lo)/(hi-lo)*ch;
    const x=i=>l+(current.days.length===1?cw/2:(i/(current.days.length-1))*cw);
    const grid=Array.from({length:5},(_,i)=>{
      const v=lo+(hi-lo)*i/4, yy=y(v);
      return `<line x1="${l}" x2="${w-r}" y1="${yy}" y2="${yy}" stroke="#f0edf5"/><text x="${l-10}" y="${yy+3}" text-anchor="end">${esc(compact(v))}${unit==='%'?'%':''}</text>`;
    }).join('');
    const ticks=[...new Set([0,Math.floor((current.days.length-1)/2),current.days.length-1])].map(i=>`<text x="${x(i)}" y="${h-12}" text-anchor="middle">${current.days[i]}</text>`).join('');
    const marks=series.map((s,si)=>{
      const fill=color(s.name), bar=current.days.length===1 || ['posts','officialPosts','memberPosts','followerDelta'].includes(key);
      const barWidth=Math.min(35,cw/(current.days.length* Math.max(series.length,1)+3));
      let pen=false,path='';
      const dots=s.points.map((p,i)=>{
        const v=value(p);if(v==null){pen=false;return '';}
        const xx=x(i),yy=y(v);
        const tooltip=esc(`${s.name} · ${p.day} · ${unitFmt(v,unit)}`);
        path+=(pen?'L':'M')+xx+','+yy+' ';pen=true;
        return bar?`<rect x="${xx+(si-(series.length-1)/2)*barWidth-barWidth*.4}" y="${Math.min(yy,y(0))}" width="${barWidth*.8}" height="${Math.max(1,Math.abs(yy-y(0)))}" rx="2" fill="${fill}" opacity=".85"><title>${tooltip}</title></rect>`:
          `<circle cx="${xx}" cy="${yy}" r="${current.days.length>100?1.8:3.2}" fill="${fill}" stroke="white" stroke-width="1.5"><title>${tooltip}</title></circle>`;
      }).join('');
      return (!bar?`<path d="${path}" fill="none" stroke="${fill}" stroke-width="2"/>`:'')+dots;
    }).join('');
    drawing=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}: ${esc(current.start)}부터 ${esc(current.end)}"><title>${esc(title)}. 미수집 일자는 연결하지 않습니다.</title>${grid}${ticks}${marks}</svg>`;
  }
  const legend=current.series.map(s=>`<button data-legend="${esc(s.name)}" class="${hidden.has(s.name)?'hidden':''}" aria-pressed="${!hidden.has(s.name)}"><span class="group-dot" style="background:${color(s.name)}"></span>${esc(s.name)}</button>`).join('');
  return `<div class="chart-title"><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div><button class="zoom" aria-label="${esc(title)} 확대">⤢</button></div>${drawing}<div class="legend">${legend}</div><div class="chart-footnote">${increment?'동일 게시물의 실제 전일·당일 스냅샷 차분. 비교 쌍이 없으면 N/A.':'값이 없는 날짜는 미수집입니다. 게시물 지표는 확보한 기록의 부분 합계입니다.'}</div>`;
}
function mountChart(element,config,hidden=new Set(),expanded=false){
  element.innerHTML=chartMarkup(config,hidden);
  element.querySelectorAll('[data-legend]').forEach(b=>b.addEventListener('click',()=>{
    const n=b.dataset.legend;hidden.has(n)?hidden.delete(n):hidden.add(n);mountChart(element,config,hidden,expanded);
  }));
  element.querySelector('.zoom')?.addEventListener('click',()=>{
    if(expanded)return;
    const target=$('#expanded-chart');target.className='chart-card';mountChart(target,config,new Set(hidden),true);$('#chart-dialog').showModal();
  });
}
function drawCharts(){
  const definitions=[
    ['#follower-charts','팔로워 총수 · 일별 추이','계정 팔로워 합계 · 일별 실제 스냅샷','followers',true],
    ['#follower-charts','팔로워 순증감','전일(KST) 기록이 있을 때만 계산','followerDelta'],
    ['#follower-charts','팔로워 증가율','(당일 − 전일) ÷ 전일 × 100','followerRate',false,'%'],
    ['#activity-charts','신규 게시물 · 공식','KST 게시일 기준 · 확보한 공식 계정 게시물','officialPosts'],
    ['#activity-charts','신규 게시물 · 멤버','KST 게시일 기준 · 확보한 멤버 게시물','memberPosts'],
    ['#activity-charts','조회수 · 게시일 기준 누적 합계','해당 일자에 게시한 글의 최신 수집 스냅샷 합계','views'],
    ['#activity-charts','게시물당 평균 조회수','관측 조회수 합계 ÷ 해당 일자 수집 게시물 수','averageViews'],
    ['#activity-charts','당일 추가 조회수','게시일별 누적 값과 별도인 스냅샷 차분','views',false,'',true],
    ['#reaction-charts','좋아요 · 누적','게시일 기준 · 최신 수집 시점의 누적 합계','likes'],
    ['#reaction-charts','좋아요 · 당일 증감','연속 스냅샷에서 계산한 반응 변화','likes',false,'',true],
    ['#reaction-charts','답글 · 누적','원 게시물 replyCount 합계 · 댓글 상세 목록과 별도','replies'],
    ['#reaction-charts','답글 · 당일 증감','연속 스냅샷에서 계산한 반응 변화','replies',false,'',true],
    ['#reaction-charts','리포스트 · 누적','원 게시물 retweetCount 합계 · 사용자 목록과 별도','reposts'],
    ['#reaction-charts','리포스트 · 당일 증감','연속 스냅샷에서 계산한 반응 변화','reposts',false,'',true],
    ['#reaction-charts','인용 · 누적','원 게시물 quoteCount 합계 · 인용 상세 목록과 별도','quotes'],
    ['#reaction-charts','인용 · 당일 증감','연속 스냅샷에서 계산한 반응 변화','quotes',false,'',true],
    ['#reaction-charts','북마크 · 누적','게시일 기준 · 참여율 계산에는 포함하지 않음','bookmarks'],
    ['#reaction-charts','참여율','(좋아요 + 답글 + 리포스트 + 인용) ÷ 조회 × 100','engagement',false,'%']
  ];
  for(const sel of ['#follower-charts','#activity-charts','#reaction-charts'])$(sel).replaceChildren();
  for(const [target,title,description,key,full,unit,increment] of definitions){
    const el=document.createElement('article');el.className='chart-card'+(full?' full':'');
    $(target).append(el);mountChart(el,{title,description,key,unit,increment});
  }
}
const columns=[['name','그룹'],['posts','게시물'],['views','조회수'],['likes','좋아요'],['replies','답글'],['reposts','리포스트'],['quotes','인용'],['engagement','참여율'],['followers','팔로워 합계'],['followerDelta','전일 순증감'],['followerRate','전일 증감률'],['completion','일별 완료율']];
function sortedRows(){return current.series.map(s=>s.summary).sort((a,b)=>{
  if(a[sort.key]===null)return b[sort.key]===null?0:1;if(b[sort.key]===null)return -1;
  return (typeof a[sort.key]==='string'?a[sort.key].localeCompare(b[sort.key],'ko'):a[sort.key]-b[sort.key])*sort.direction;
});}
function drawTable(){
  $('#comparison-table').innerHTML=`<thead><tr>${columns.map(([key,label])=>`<th><button data-sort="${key}">${label}${sort.key===key?(sort.direction===1?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${sortedRows().map(r=>`<tr>${columns.map(([key])=>`<td>${key==='name'?`<span class="group-dot" style="background:${color(r.name)}"></span> ${esc(r.name)}`:r[key]===null?'<span class="na">N/A</span>':unitFmt(r[key],['engagement','followerRate'].includes(key)?'%':'')}</td>`).join('')}</tr>`).join('')}</tbody>`;
  $('#comparison-table').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort={key:b.dataset.sort,direction:sort.key===b.dataset.sort?-sort.direction:-1};drawTable();});
  $('#table-range').textContent=`${current.start} ~ ${current.end} · 관측된 부분 합계입니다. 팔로워는 ${current.end} 기준이며 전일 증감은 실제 하루 전 기록만 비교합니다.`;
}
function drawPosts(){
  const key=$('#top-sort').value;
  const score=p=>key==='engagement'?rate(p):key==='createdAt'?p.createdAt:p[key];
  const posts=[...current.posts].sort((a,b)=>{
    const aa=score(a),bb=score(b);if(aa==null)return bb==null?0:1;if(bb==null)return -1;
    return typeof aa==='string'?bb.localeCompare(aa):bb-aa;
  }).slice(0,10);
  $('#post-list').innerHTML=posts.length?posts.map((p,i)=>{
    const account=data.accounts.find(a=>a.key===p.handle);
    return `<article class="post-card"><span class="rank">${String(i+1).padStart(2,'0')}</span><div><div class="post-meta">${esc(account?.group)} · @${esc(p.handle)} · ${esc(p.createdAt.replace('T',' ').slice(0,16))} KST · 반응 기준 ${esc(p.snapshotDay)}</div><p class="post-text"><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.text.slice(0,240))}${p.text.length>240?'…':''}</a></p><div class="post-metrics"><span>조회 <strong>${fmt(p.views)}</strong></span><span>좋아요 <strong>${fmt(p.likes)}</strong></span><span>참여율 <strong>${unitFmt(rate(p),'%')}</strong></span></div></div><a class="post-external" aria-label="X 원문 열기" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">↗</a></article>`;
  }).join(''):'<div class="empty-posts">선택 기간에 수집된 게시물이 없습니다. 미수집을 게시물 0건으로 해석할 수 없습니다.</div>';
}
function drawQuality(){
  const stage=r=>r.requests?`${r.succeeded}/${r.requests} 요청 성공${r.failed?' · 실패 '+r.failed:''}<small>전체 완료 미확인</small>`:'<span class="quality-unknown">요청 기록 없음</span>';
  $('#quality-table').innerHTML=`<thead><tr><th>계정</th><th>프로필 기록</th><th>게시물 요청</th><th>멘션 요청</th><th>상세 요청</th><th>대기 작업</th><th>최근 성공 요청 · KST</th></tr></thead><tbody>${current.coverage.map(r=>`<tr><td>@${esc(r.handle)}<small>${esc(r.group)} · ${esc(r.role)}</small></td><td><span class="${r.profile?'quality-ok':'quality-unknown'}">${r.profile?'기록 있음':'미수집'}</span></td><td>${stage(r.postRequests)}<small>저장 이력 ${r.postsStored}건 · 선택일 발행 ${r.selectedDayPosts}건</small></td><td>${stage(r.mentionRequests)}</td><td>${stage(r.detailRequests)}</td><td>${fmt(r.pending)}</td><td>${r.lastSuccess?esc(r.lastSuccess.replace('T',' ').slice(0,19)):'기록 없음'}</td></tr>`).join('')}</tbody>`;
  $('#detail-quality').innerHTML=Object.entries(data.details).map(([name,s])=>`<span>전체 스냅샷 · ${esc(name)}<br>저장 ${s.storedRows}건 / 중복·원글 제외 ${s.uniqueValidRows}건${s.selfRowsExcluded?' · 원글 혼입 '+s.selfRowsExcluded+'건 제외':''}<br>원 게시물 반응 수에 더하지 않음 · 전체 수집 미확인</span>`).join('');
}
function render(){
  if(!state.end)return;current=analyze(data,state);
  const coverage=current.coverage,profiles=coverage.filter(r=>r.profile).length;
  const stored=coverage.filter(r=>r.postsStored>0).length;
  const pending=coverage.reduce((s,r)=>s+r.pending,0);
  const followers=strictSum(current.series.map(s=>s.summary.followers));
  $('#overview').innerHTML=card('계정 팔로워 합계',fmt(followers),'중복 팔로워가 포함될 수 있습니다.','↗')+
    card('프로필 기록',`${profiles}<span class="accent"> / ${coverage.length}</span>`,'선택 기준일 · 실제 저장 여부','◉')+
    card('관측 게시물',fmt(current.posts.length),'선택 기간 게시일 기준 · 완결성 미확인','▦')+
    card('상세 수집 대기',fmt(pending),'스냅샷의 PENDING 상태 · 미완료','◷');
  $('#range-label').textContent=`${current.start} — ${current.end} · KST · ${current.accounts.length}개 계정`;
  $('#collection-time').textContent=`마지막 성공 요청 ${data.source.lastSuccessfulRequestAt?.replace('T',' ').slice(0,19)||'기록 없음'} KST · 전체 수집 완료 시각 아님`;
  $('#status').innerHTML=`<strong>첨부 스냅샷 · 실시간 연결 전</strong> &nbsp; 기준일 프로필 ${profiles}/${coverage.length} · 게시물 이력 보유 ${stored}/${coverage.length} · 상세 대기 ${pending}건. 일별 수집 완결성은 확인되지 않았습니다. 누적 반응은 게시일별 묶음의 최신 관측값이며, 당일 증가분과 다릅니다.`;
  drawCharts();drawTable();drawPosts();drawQuality();
}
function download(){
  const cell=v=>'"'+String(v??'N/A').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['조회 시작',current.start,'조회 종료',current.end,'시간대','Asia/Seoul'],['데이터 기준',data.source.label,'범위','관측된 부분 합계 · 일별 완료율 미확인'],columns.map(([,label])=>label),...sortedRows().map(r=>columns.map(([k])=>r[k]))];
  const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=`x-radar-${current.start}-${current.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function init(){
  try{
    const response=await fetch('./data.json',{cache:'no-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();
    allGroups.push(...new Set(data.accounts.map(a=>a.group)));
    state={end:data.source.defaultDay,period:'7',groups:[...allGroups],mode:'all',handles:[]};
    $('#date').value=state.end;$('#date').max=data.source.defaultDay;
    $('#source-tag').textContent='스냅샷 · '+(data.source.defaultDay||'날짜 미상').replaceAll('-','.');$('#sheet-link').href=data.source.sheetUrl;
    $('#groups').innerHTML=allGroups.map(g=>`<button class="group-button selected" data-group="${esc(g)}" aria-pressed="true"><span class="group-dot" style="background:${color(g)}"></span>${esc(g)}</button>`).join('');
    $('#groups').querySelectorAll('button').forEach(b=>b.onclick=()=>{
      const g=b.dataset.group;
      if(state.groups.includes(g)){
        if(state.groups.length===1)return;state.groups=state.groups.filter(v=>v!==g);
      }else state.groups.push(g);
      b.classList.toggle('selected',state.groups.includes(g));b.setAttribute('aria-pressed',String(state.groups.includes(g)));render();
    });
    $('#accounts').innerHTML=data.accounts.map(a=>`<label><input type="checkbox" value="${esc(a.key)}" checked>${esc(a.group)} · @${esc(a.handle)}</label>`).join('');
    $('#accounts').onchange=()=>{const selected=[...$('#accounts').querySelectorAll('input:checked')].map(el=>el.value);state.handles=selected.length?selected:['__none__'];render();};
    $('#date').onchange=()=>{if($('#date').validity.valid&&$('#date').value){state.end=$('#date').value;render();}};
    $('#mode').onchange=()=>{state.mode=$('#mode').value;render();};
    $('#periods').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.period=b.dataset.period;$('#periods').querySelectorAll('button').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});render();});
    $('#top-sort').onchange=drawPosts;$('#download').onclick=download;$('#close-dialog').onclick=()=>$('#chart-dialog').close();
    render();document.documentElement.dataset.ready='true';
  }catch(error){$('#status').classList.add('error');$('#status').textContent='데이터를 불러오지 못했습니다. 새로고침하거나 데이터 배포 상태를 확인해 주세요.';console.error(error);}
}
init();
