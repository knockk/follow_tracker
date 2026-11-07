import {analyze, COLORS, METRICS, rate, chartDates, languageRegionDistribution} from './metrics.mjs';
import {loadRadarData} from './bridge.mjs';
const $ = s=>document.querySelector(s);
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v,decimals=0)=>v===null||v===undefined?'미수집':Number(v).toLocaleString('ko-KR',{maximumFractionDigits:decimals});
const compact = n=>Math.abs(n)>=1e6?(n/1e6).toFixed(1)+'M':Math.abs(n)>=1e3?(n/1e3).toFixed(1)+'k':fmt(n,1);
const unitFmt = (v,unit)=>v==null?'N/A':fmt(v,unit==='%'?2:0)+(unit==='%'?'%':'');
let data, current, state, sort={key:'views',direction:-1};
let chartSequence=0;
const allGroups=[];
const color = name=>COLORS[allGroups.indexOf(name)%COLORS.length];
function chartMarkup(config,hidden=new Set()) {
  const {title,description,key,unit='',increment=false}=config;
  const series=current.series.filter(s=>!hidden.has(s.name));
  const value=p=>increment?p.increments[key]:p[key];
  const days=chartDates(current,key,increment),singleObservation=days.length===1&&current.days.length>1;
  const indices=days.map(d=>current.days.indexOf(d));
  const displayedSeries=series.map(s=>({...s,points:indices.map(i=>s.points[i])}));
  const values=series.flatMap(s=>s.points.map(value)).filter(v=>v!==null&&v!==undefined);
  const otherValues=series.filter(s=>s.name!=='플레이브').flatMap(s=>s.points.map(value)).filter(v=>v!=null);
  const axisValues=otherValues.length?otherValues:values;
  let lo=Math.min(0,...axisValues),hi=Math.max(0,...axisValues);
  if(lo===hi)hi=lo+1;else {if(hi>0)hi*=1.12;if(lo<0)lo*=1.12;}
  const clipped=series.some(s=>s.name==='플레이브'&&s.points.some(p=>value(p)!=null&&(value(p)>hi||value(p)<lo)));
  let drawing='';
  if(!values.length) drawing='<div class="chart-empty" data-chart-surface><span>표시할 수 있는 기록이 없습니다</span><small>미수집 · 비교 가능한 전일 기록이 없으면 N/A</small></div>';
  else {
    const w=800,h=245,l=57,r=18,t=14,b=38,cw=w-l-r,ch=h-t-b;
    const clipId='plot-clip-'+(++chartSequence);
    const bar=days.length===1 || ['posts','officialPosts','memberPosts','followerDelta'].includes(key);
    const barWidth=Math.min(35,cw/(days.length* Math.max(series.length,1)+3));
    const pad=bar&&days.length>1?barWidth*series.length/2:0;
    const y=v=>t+ch-(v-lo)/(hi-lo)*ch;
    const x=i=>l+(days.length===1?cw/2:pad+(i/(days.length-1))*(cw-2*pad));
    const grid=Array.from({length:5},(_,i)=>{
      const v=lo+(hi-lo)*i/4, yy=y(v);
      return `<line x1="${l}" x2="${w-r}" y1="${yy}" y2="${yy}" stroke="#f0edf5"/><text x="${l-10}" y="${yy+3}" text-anchor="end">${esc(compact(v))}${unit==='%'?'%':''}</text>`;
    }).join('');
    const ticks=[...new Set([0,Math.floor((days.length-1)/2),days.length-1])].map(i=>`<text x="${x(i)}" y="${h-12}" text-anchor="middle">${days[i]}</text>`).join('');
    const marks=displayedSeries.map((s,si)=>{
      const fill=color(s.name);
      let pen=false,path='';
      const dots=s.points.map((p,i)=>{
        const v=value(p);if(v==null){pen=false;return '';}
        const xx=x(i),yy=y(v);
        const tooltip=esc(`${s.name} · ${p.day} · ${unitFmt(v,unit)}`);
        path+=(pen?'L':'M')+xx+','+yy+' ';pen=true;
        return bar?`<rect x="${xx+(si-(series.length-1)/2)*barWidth-barWidth*.4}" y="${Math.min(yy,y(0))}" width="${barWidth*.8}" height="${Math.max(1,Math.abs(yy-y(0)))}" rx="2" fill="${fill}" opacity=".85"><title>${tooltip}</title></rect>`:
          `<circle cx="${xx}" cy="${yy}" r="${days.length>100?1.8:3.2}" fill="${fill}" stroke="white" stroke-width="1.5"><title>${tooltip}</title></circle>`;
      }).join('');
      return (!bar?`<path d="${path}" fill="none" stroke="${fill}" stroke-width="2"/>`:'')+dots;
    }).join('');
    drawing=`<svg data-chart-surface data-x-start="${x(0)}" data-x-end="${x(days.length-1)}" data-axis-max="${hi}" data-observed-days="${days.length}" viewBox="0 0 ${w} ${h}" role="img" tabindex="0" aria-label="${esc(title)}: ${esc(current.start)}부터 ${esc(current.end)}"><title>${esc(title)}. 미수집 일자는 연결하지 않습니다. 방향키로 날짜별 수치를 확인할 수 있습니다.</title><defs><clipPath id="${clipId}"><rect x="${l-1}" y="${t}" width="${cw+2}" height="${ch+1}"/></clipPath></defs>${grid}${ticks}<g class="plot-marks" clip-path="url(#${clipId})">${marks}</g><line class="hover-guide" x1="0" x2="0" y1="${t}" y2="${t+ch}" stroke="#b8acd1" stroke-dasharray="4 4" visibility="hidden"/></svg>`;
  }
  const legend=current.series.map(s=>`<button data-legend="${esc(s.name)}" class="${hidden.has(s.name)?'hidden':''}" aria-pressed="${!hidden.has(s.name)}"><span class="group-dot" style="background:${color(s.name)}"></span>${esc(s.name)}</button>`).join('');
  const displayTitle=singleObservation&&key==='followers'?'팔로워 총수 · '+days[0]+' 기록':title;
  return `<div class="chart-title"><div><h3>${esc(displayTitle)}</h3><p>${esc(description)}</p></div><button class="zoom" aria-label="${esc(title)} 확대">⤢</button></div>${singleObservation?`<div class="snapshot-note">선택 ${current.days.length}일 중 기록 1일 · 하루치 막대로 표시합니다. 추이는 서로 다른 날짜의 기록이 필요합니다.</div>`:''}${drawing}<div class="legend">${legend}</div>${clipped?'<div class="clipping-note">↥ 플레이브는 세로축 범위 밖을 잘라 표시합니다. 마우스를 올리면 실제 수치를 볼 수 있습니다.</div>':''}<div class="chart-footnote">${increment?'동일 게시물의 실제 전일·당일 스냅샷 차분. 비교 쌍이 없으면 N/A.':'값이 없는 날짜는 미수집입니다. 게시물 지표는 확보한 기록의 부분 합계입니다.'}</div>`;
}
function mountChart(element,config,hidden=new Set(),expanded=false){
  element.innerHTML=chartMarkup(config,hidden);
  const surface=element.querySelector('[data-chart-surface]');
  const tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.role='tooltip';tooltip.hidden=true;element.append(tooltip);
  const guide=element.querySelector('.hover-guide');
  const days=chartDates(current,config.key,config.increment);
  let activeIndex=days.length-1;
  const show=(index,clientX,clientY)=>{
    activeIndex=index;
    const unit=config.unit==='%'?'%':['followers','followerDelta'].includes(config.key)?'명':['views','averageViews'].includes(config.key)?'회':'건';
    const rows=current.series.filter(s=>!hidden.has(s.name)).map(s=>{
      const p=s.points[current.days.indexOf(days[index])],v=config.increment?p.increments[config.key]:p[config.key];
      return `<div><span><i style="background:${color(s.name)}"></i>${esc(s.name)}</span><strong>${v==null?'미수집 / N/A':fmt(v,unit==='%'?2:config.key==='averageViews'?1:0)+unit}</strong></div>`;
    }).join('');
    tooltip.innerHTML=`<header>${days[index]} <small>KST</small></header>${rows}`;tooltip.hidden=false;
    const bounds=element.getBoundingClientRect();
    const left=Math.max(8,Math.min(clientX-bounds.left+14,bounds.width-tooltip.offsetWidth-8));
    const top=Math.max(8,Math.min(clientY-bounds.top-tooltip.offsetHeight-12,bounds.height-tooltip.offsetHeight-8));
    tooltip.style.left=left+'px';tooltip.style.top=top+'px';
    if(guide){const a=Number(surface.dataset.xStart),b=Number(surface.dataset.xEnd),x=a+(days.length===1?0:index/(days.length-1)*(b-a));guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.setAttribute('visibility','visible');}
  };
  const move=event=>{
    const bounds=surface.getBoundingClientRect();
    const a=Number(surface.dataset.xStart??0),b=Number(surface.dataset.xEnd??800);
    const x=(event.clientX-bounds.left)/bounds.width*800;
    const i=days.length===1?0:Math.round(Math.max(0,Math.min(1,(x-a)/(b-a)))*(days.length-1));
    show(i,event.clientX,event.clientY);
  };
  const hide=()=>{tooltip.hidden=true;guide?.setAttribute('visibility','hidden');};
  surface?.addEventListener('pointermove',move);surface?.addEventListener('pointerdown',move);surface?.addEventListener('pointerleave',hide);
  surface?.addEventListener('keydown',event=>{
    if(event.key==='Escape'){hide();return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const index=event.key==='Home'?0:event.key==='End'?days.length-1:Math.max(0,Math.min(days.length-1,activeIndex+(event.key==='ArrowLeft'?-1:1)));
    const bounds=surface.getBoundingClientRect();show(index,bounds.left+bounds.width/2,bounds.top+bounds.height/2);
  });
  surface?.addEventListener('blur',hide);
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
  $('#range-label').textContent=`${current.start} — ${current.end} · KST · ${current.accounts.length}개 계정`;
  $('#collection-time').textContent=`마지막 성공 요청 ${data.source.lastSuccessfulRequestAt?.replace('T',' ').slice(0,19)||'기록 없음'} KST · 전체 수집 완료 시각 아님`;
  const sourceTitle=data.source.bridgeFailed?'시트 연결 실패 · 보관된 첨부 스냅샷 표시 중':data.source.syncMode==='daily'?`매일 오전 10시 갱신 · 최근 반영 ${esc(data.source.refreshedAt?.replace('T',' ').slice(0,16))} KST`:'첨부 스냅샷 · 실시간 연결 전';
  $('#status').innerHTML=`<strong>${sourceTitle}</strong> &nbsp; 기준일 프로필 ${profiles}/${coverage.length} · 게시물 이력 보유 ${stored}/${coverage.length} · 상세 대기 ${pending}건. 일별 수집 완결성은 확인되지 않았습니다. 누적 반응은 게시일별 묶음의 최신 관측값이며, 당일 증가분과 다릅니다.`;
  drawCharts();drawTable();drawPosts();drawQuality();drawGeography();
}
function drawGeography(){
  const distribution=languageRegionDistribution(data,current,$('#country-type').value);
  const total=distribution.reduce((n,g)=>n+g.total,0),classified=distribution.reduce((n,g)=>n+g.classified,0);
  $('#country-summary').textContent=total?`댓글·멘션 ${fmt(total)}건 · 언어 기반 분류 ${fmt(classified)}건 · 언어 미확인 ${fmt(total-classified)}건. 이모지·언어 불명은 추정에서 제외하며, 비율의 분모에는 미확인 글도 포함합니다.`:'선택 수집일·계정 범위에 저장된 댓글·멘션이 없습니다. 국가별 0건으로 해석할 수 없습니다.';
  $('#country-cards').innerHTML=distribution.map(g=>`<article class="country-card" data-country-group="${esc(g.group)}"><header><h3><span class="group-dot" style="background:${color(g.group)}"></span>${esc(g.group)}</h3><span>${g.total?fmt(g.total)+'건':'활동 미수집'}</span></header>${g.total?`<p class="country-coverage">언어 분류 가능 ${fmt(g.coverage,1)}% · ${fmt(g.classified)}/${fmt(g.total)}건</p><div class="country-bars">${g.regions.map(c=>`<div class="country-row"><div><span title="${esc(c.language?'저장된 언어: '+c.language:'이모지·언어 불명·미지원 태그')}">${esc(c.region?c.label||c.region:'언어 미확인')}</span><strong>${fmt(c.count)}건 <small>${fmt(c.share,1)}%</small></strong></div><div class="country-track"><span style="width:${c.share}%;background:${c.region?color(g.group):'#d9d3e4'}"></span></div></div>`).join('')}</div><p class="country-empty-note">언어를 단서로 한 추정입니다.<br>실제 국가·국적·거주지를 확인한 값이 아닙니다.</p>`:'<div class="country-no-data">댓글·멘션 기록이 필요합니다.<small>국가·지역 추정 비율을 계산할 수 없습니다.</small></div>'}</article>`).join('');
}
function download(){
  const cell=v=>'"'+String(v??'N/A').replace(/^[=+\-@]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['조회 시작',current.start,'조회 종료',current.end,'시간대','Asia/Seoul'],['데이터 기준',data.source.label,'범위','관측된 부분 합계 · 일별 완료율 미확인'],columns.map(([,label])=>label),...sortedRows().map(r=>columns.map(([k])=>r[k]))];
  const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');a.href=url;a.download=`x-radar-${current.start}-${current.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function init(){
  try{
    data=await loadRadarData();
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
    $('#top-sort').onchange=drawPosts;$('#country-type').onchange=drawGeography;$('#download').onclick=download;$('#close-dialog').onclick=()=>$('#chart-dialog').close();
    render();document.documentElement.dataset.ready='true';
  }catch(error){$('#status').classList.add('error');$('#status').textContent='데이터를 불러오지 못했습니다. 새로고침하거나 데이터 배포 상태를 확인해 주세요.';console.error(error);}
}
init();
