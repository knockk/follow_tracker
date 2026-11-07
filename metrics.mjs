export const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks'];
export const COLORS = ['#7365d8', '#168b85', '#e18d43', '#d15e81', '#4285be', '#889641'];
export const previousDay = day => addDays(day, -1);
export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export function strictSum(values) {
  return !values.length || values.some(v => v === null || v === undefined) ? null : values.reduce((a,b) => a+b, 0);
}
export function rate(metrics) {
  const reactions = strictSum(['likes','replies','reposts','quotes'].map(k => metrics[k]));
  return metrics.views > 0 && reactions !== null ? reactions / metrics.views * 100 : null;
}
export function dateRange(start, end) {
  const days = []; for(let d=start; d<=end; d=addDays(d,1)) days.push(d); return days;
}
export function latestSamples(data) {
  const result = new Map();
  for(const s of data.samples) if(!result.has(s.id) || result.get(s.id).day <= s.day) result.set(s.id,s);
  return result;
}
export function chartDates(analysis, key, increment=false) {
  // A lone real observation is a dated snapshot, never a fabricated trend line.
  const observed=analysis.days.filter((d,i)=>analysis.series.some(s=>(increment?s.points[i].increments[key]:s.points[i][key])!=null));
  return observed.length===1 ? observed : analysis.days;
}
export function countryDistribution(data,analysis,type='all') {
  const selected=new Set(analysis.accounts.map(a=>a.key));
  const rows=(data.geography?.rows||[]).filter(r=>selected.has(r.handle)&&r.day>=analysis.start&&r.day<=analysis.end&&(type==='all'||r.type===type));
  return [...new Set(analysis.accounts.map(a=>a.group))].map(group=>{
    const grouped=rows.filter(r=>r.group===group),counts=new Map();
    for(const r of grouped){const name=r.country||null;counts.set(name,(counts.get(name)||0)+r.count);}
    const total=grouped.reduce((n,r)=>n+r.count,0),unknown=counts.get(null)||0;
    return {group,total,unknown,known:total-unknown,coverage:total?(total-unknown)/total*100:null,
      countries:[...counts].map(([country,count])=>({country,count,share:count/total*100})).sort((a,b)=>b.count-a.count)};
  });
}
export function analyze(data, options) {
  const {end, period='7', groups=[], mode='all', handles=[]} = options;
  const accounts = data.accounts.filter(a => (!groups.length || groups.includes(a.group)) &&
    (mode !== 'official' || a.role === '공식') &&
    (mode !== 'members' || a.role !== '공식') && (!handles.length || handles.includes(a.key)));
  const selected = new Set(accounts.map(a=>a.key));
  const allDays = [...data.profiles.map(p=>p.day), ...data.posts.map(p=>p.day)].filter(Boolean).sort();
  const start = period === 'all' ? (allDays[0] < end ? allDays[0] : end) : addDays(end, 1-Number(period));
  const days = dateRange(start,end);
  const latest = latestSamples(data);
  const posts = data.posts.filter(p=>selected.has(p.handle) && p.day >= start && p.day <= end)
    .map(p=>({...p,...(latest.get(p.id) || {}), day:p.day, snapshotDay:(latest.get(p.id)?.day || p.observedDay)}));
  const profileMap = new Map(data.profiles.filter(p=>p.status==='성공').map(p=>[p.handle+'|'+p.day,p]));
  const postMap = new Map(data.posts.map(p=>[p.id,p]));
  const sampleMap = new Map(data.samples.map(s=>[s.id+'|'+s.day,s]));
  const seriesNames = [...new Set(accounts.map(a=>a.group))];
  const followersFor = (members,d) => strictSum(members.map(a=>profileMap.get(a.key+'|'+d)?.followers));
  const sums = rows => Object.fromEntries(METRICS.map(k=>[k,strictSum(rows.map(p=>p[k]))]));
  const series = seriesNames.map(name=>{
    const members = accounts.filter(a=>a.group===name);
    const memberHandles = new Set(members.map(a=>a.key));
    const groupPosts = posts.filter(p=>memberHandles.has(p.handle));
    const points = days.map(day=>{
      const current = followersFor(members,day), prior = followersFor(members,previousDay(day));
      const delta = current===null || prior===null ? null : current-prior;
      const dayPosts = groupPosts.filter(p=>p.day===day);
      const metrics = sums(dayPosts);
      const paired = data.samples.filter(s=>s.day===day && memberHandles.has(postMap.get(s.id)?.handle));
      const increments = Object.fromEntries(METRICS.map(k=>{
        // Every included tweet must have an exact previous-calendar-day observation.
        const diffs = paired.map(s=>{
          const prev = sampleMap.get(s.id+'|'+previousDay(day));
          return s[k] == null || prev?.[k] == null ? null : s[k]-prev[k];
        });
        return [k,strictSum(diffs)];
      }));
      return {day,followers:current,followerDelta:delta,
        followerRate:delta===null || !prior ? null : delta/prior*100,
        posts:dayPosts.length || null,
        officialPosts:dayPosts.filter(p=>members.find(a=>a.key===p.handle)?.role==='공식').length || null,
        memberPosts:dayPosts.filter(p=>members.find(a=>a.key===p.handle)?.role!=='공식').length || null,
        ...metrics,averageViews:metrics.views===null?null:metrics.views/dayPosts.length,
        engagement:rate(metrics), increments,pairedTweets:paired.filter(s=>sampleMap.has(s.id+'|'+previousDay(day))).length};
    });
    const totalMetrics=sums(groupPosts);
    const current=followersFor(members,end), prior=followersFor(members,previousDay(end));
    return {name,points,summary:{name,posts:groupPosts.length||null,...totalMetrics,
      averageViews:totalMetrics.views===null?null:totalMetrics.views/groupPosts.length,
      engagement:rate(totalMetrics),followers:current,
      followerDelta:current===null||prior===null?null:current-prior,
      followerRate:current===null||!prior?null:(current-prior)/prior*100,
      completion:null}};
  });
  const coverage = accounts.map(a=>{
    const requestRows=data.requests.filter(r=>r.handle===a.key && r.at.slice(0,10)===end);
    const stage = name=>{
      const rows=requestRows.filter(r=>r.stage===name);
      return {requests:rows.length,succeeded:rows.filter(r=>r.ok).length,failed:rows.filter(r=>!r.ok).length,complete:null};
    };
    const history=data.posts.filter(p=>p.handle===a.key);
    const queue=data.queue.filter(q=>q.handle===a.key && q.day<=end);
    const successes=data.requests.filter(r=>r.handle===a.key&&r.ok&&r.at.slice(0,10)<=end).map(r=>r.at).sort();
    return {...a, profile:profileMap.has(a.key+'|'+end), postsStored:history.length,
      selectedDayPosts:history.filter(p=>p.day===end).length,
      profileRequests:stage('profile'),postRequests:stage('posts'),mentionRequests:stage('mentions'),detailRequests:stage('details'),
      pending:queue.filter(q=>q.status==='PENDING').reduce((n,q)=>n+q.count,0),
      lastSuccess:successes.at(-1)||null,complete:null};
  });
  return {start,end,days,accounts,posts,series,coverage};
}
