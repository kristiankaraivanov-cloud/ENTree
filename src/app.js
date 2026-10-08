'use strict';
const $ = id => document.getElementById(id);
const defaults = { theme: 'aurora', accent: '#16d7e5', scale: 100, gap: 1, depth: 3, palette: 'aurora', labels: true, hidden: true };
let settings = { ...defaults };
try {
 const stored = JSON.parse(localStorage.getItem('entree-settings-v2') || '{}');
 for (const key of ['theme','palette']) if ((key === 'theme' ? ['light','dark','eclipse','aurora','system'] : ['reference','forest','ocean','mono','eclipse','aurora']).includes(stored[key])) settings[key] = stored[key];
 if (/^#[0-9a-f]{6}$/i.test(stored.accent)) settings.accent = stored.accent;
 for (const [key,min,max] of [['scale',85,120],['gap',0,8],['depth',1,4]]) if (Number.isFinite(stored[key])) settings[key] = Math.max(min,Math.min(max,stored[key]));
 for (const key of ['labels','hidden']) if (typeof stored[key] === 'boolean') settings[key] = stored[key];
 if (!localStorage.getItem('entree-eclipse-applied-v1')) Object.assign(settings, { theme:'eclipse', accent:'#ffb454', palette:'eclipse' });
 if (!localStorage.getItem('entree-aurora-background-v1')) settings.theme='aurora';
 if (!localStorage.getItem('entree-ocean-aurora-palette-v1')) Object.assign(settings, { theme:'aurora', accent:'#16d7e5', palette:'aurora' });
} catch {}
const palettes = {
 eclipse:{ video:'#a74726', media:'#9b364b', code:'#827447', cache:'#be7725', documents:'#74758c', downloads:'#bc582c', git:'#8b4865', other:'#595362', application:'#77444e', system:'#96722c' },
 aurora:{ video:'#20b9dc', media:'#bd6ce8', code:'#20c9b7', cache:'#6855cf', documents:'#45a9de', downloads:'#8e60d8', git:'#da68c6', other:'#756d9a', application:'#327fcd', system:'#34cbb8' },
 reference:{ video:'#0089f6', media:'#ed6469', code:'#00a69f', cache:'#eea71b', documents:'#0aa7d4', downloads:'#ff943b', git:'#8a53ed', other:'#8794a3', application:'#7950df', system:'#e7b124' },
 forest:{ video:'#47816c', media:'#9a749b', code:'#31927c', cache:'#b88842', documents:'#648fa0', downloads:'#b77d5d', git:'#8881a7', other:'#83907b', application:'#847ab3', system:'#ae9a4e' },
 ocean:{ video:'#167ccc', media:'#af69b4', code:'#169aa9', cache:'#ce9e4d', documents:'#58a7b9', downloads:'#e28566', git:'#816ddd', other:'#758b9d', application:'#7d65b8', system:'#c4a54b' },
 mono:{ video:'#60798c', media:'#7b92a3', code:'#536c7e', cache:'#90a1ae', documents:'#68859a', downloads:'#8296a7', git:'#526b80', other:'#9aa9b5', application:'#738ca0', system:'#617e92' }
};
const extensions = {
 '.mp4':['MP4 Video File','#168bfa'],'.mkv':['Matroska Video','#168bfa'],'.zip':['Compressed Archive','#ed557d'],'.exe':['Application','#3dafa6'],'.dll':['Application Extension','#99a4ae'],'.vhdx':['Hard Disk Image','#fa6c65'],'.sys':['System File','#84a747'],'.iso':['Disc Image File','#994ef5'],'.7z':['7-Zip Archive','#8152d8'],'.jpg':['JPEG Image','#28a4ae'],'.png':['PNG Image','#67ac40'],'.pdf':['PDF Document','#f4b941'],'.msi':['Windows Installer','#09adef'],'.log':['Text Document','#9e5ae8'],'.json':['JSON File','#ff8c35'],'.dat':['DAT File','#ffbd37'],'.js':['JavaScript Source','#00a69f'],'.ts':['TypeScript Source','#00a69f'],'.py':['Python Source','#00a69f'],'.rs':['Rust Source','#00a69f'],'.md':['Markdown Document','#0aa7d4'],'.txt':['Text Document','#0aa7d4']
};
let tree,view,selection,stats,volume,demo=true,scanning=false,fileMode=false,largestMode=false,scanStarted=0,elapsed=0,sortKey='size',sortDirection=-1,extSort='size',extensionFilter=null,zoom=100;
let marked=new Map(),index=new Map(),parents=new Map(),expanded=new Set(),toastTimer,extensionRows=[];
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function icon(name,cls){const e=el('img',cls);e.src='icons/'+name+'.svg';e.alt='';return e;}
function bytes(n){if(n===null||n===undefined)return '—';if(!n)return '0 B';const u=['B','KB','MB','GB','TB'],i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toLocaleString(undefined,{maximumFractionDigits:i<2?0:1})+' '+u[i];}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function category(n){if(/^windows$/i.test(n.name))return 'system';if(/^(applications|program files)/i.test(n.name))return 'application';if(/\.(mp4|mkv|mov|avi|webm)$/i.test(n.name)||/^videos$/i.test(n.name))return 'video';return n.category||'other';}
function color(n){return palettes[settings.palette][category(n)]||palettes[settings.palette].other;}
function ext(n){const match=n.name.match(/\.[^.]+$/);return match?match[0].toLowerCase():'(other)';}
function sample(){
 const GB=1024**3;
 function leaf(name,size,kind){return {name,size:size*GB,allocated:(size*1.002)*GB,files:1,folders:0,directory:false,category:kind,children:[],modified:Date.UTC(2025,3,26,13,50)};}
 function folder(name,entries,kind){return {name,directory:true,category:kind,children:entries,size:0,allocated:0,files:0,folders:0,modified:Date.UTC(2025,3,26,13,50)};}
 function contents(prefix,size,kind,extension,count=26){const weights=Array.from({length:count},(_,i)=>1+Math.pow(count-i,1.7));const total=weights.reduce((a,b)=>a+b,0);return weights.map((weight,i)=>leaf(prefix+'-'+String(i+1).padStart(2,'0')+extension,size*weight/total,kind));}
 const root=folder('C:\\',[
 folder('Videos',contents('Recording',95.4,'video','.mp4',48),'media'),
 folder('Windows',[...contents('System',70.4,'system','.dll',50),...contents('Disk',11.2,'system','.sys',25),...contents('Resources',10.7,'system','.dat',20)],'other'),
 folder('Applications',contents('Application',58.4,'application','.exe',45),'other'),
 folder('Projects',[folder('ENTree',contents('module',12.1,'code','.js',25),'code'),folder('Workflow automation',contents('workflow',8.4,'code','.json',18),'code'),folder('Design system',contents('component',7.3,'code','.ts',24),'code'),folder('Experiments',contents('experiment',4.3,'code','.py',16),'code')],'code'),
 folder('Images',[...contents('Photo',8.4,'media','.jpg',28),...contents('Artwork',6.1,'media','.png',20)],'media'),
 folder('Downloads',[...contents('Archive',12.1,'downloads','.zip',20),...contents('Installer',5.1,'downloads','.msi',10)],'downloads'),
 folder('Documents',contents('Report',5.8,'documents','.pdf',20),'documents'),
 folder('.cache',contents('Cache',6.4,'cache','.log',25),'cache'),
 folder('Other',contents('Data',22.3,'other','.bin',30),'other')
 ],'other');
 function finish(n,parent){n.path=parent?parent+'\\'+n.name:'C:\\';for(const child of n.children)finish(child,n.path.replace(/\\$/,''));if(n.directory){for(const child of n.children){n.size+=child.size;n.allocated+=child.allocated;n.files+=child.files;n.folders+=child.folders+(child.directory?1:0);}}}
 finish(root,'');return root;
}
function load(result,isDemo){
 tree=result.tree;stats=result.stats;volume=result.volume;demo=isDemo;view=tree;selection=tree;marked.clear();index.clear();parents.clear();expanded=new Set([tree.path]);extensionFilter=null;largestMode=false;
 const stack=[tree];while(stack.length){const n=stack.pop();index.set(n.path,n);for(const c of n.children){parents.set(c.path,n);stack.push(c);}}
 if(demo){const projects=tree.children.find(n=>n.name==='Projects');selection=projects||tree;expanded.add(projects.path);elapsed=2.4;}else elapsed=(performance.now()-scanStarted)/1000;
 $('search').value='';$('source-badge').textContent=demo?'DEMO DATA':'LOCAL · PRIVATE';setScanning(false);
 $('status').textContent=demo?'Scan complete · sample data':(stats.truncated?'Partial scan · limit reached':'Scan complete')+(stats.unreadable?' · '+stats.unreadable+' unreadable':'')+(stats.links?' · '+stats.links+' links/mounts skipped':'');
 render();
}
function showDemo(){if(!scanning){const sampleTree=sample();load({tree:sampleTree,stats:{},volume:{total:500*1024**3,free:500*1024**3-sampleTree.allocated}},true);}}
function isMarked(n){while(n){if(marked.has(n.path))return true;n=parents.get(n.path);}return false;}
function go(n){if(!n.directory||scanning)return;view=n;selection=n;expanded.add(n.path);$('search').value='';extensionFilter=null;zoom=100;$('zoom').value=100;render();}
function up(){const p=parents.get(view.path);if(p)go(p);}
function select(n){selection=n;renderTables();drawMap();renderDetails();}
function toggleMark(n=selection){
 if(!n||scanning)return;if(n===tree){toast('The scan root is protected. Select an item inside it.');return;}
 let p=parents.get(n.path);while(p){if(marked.has(p.path)){toast('Its parent is already marked. Unmark the parent first.');return;}p=parents.get(p.path);}
 if(marked.has(n.path))marked.delete(n.path);else{for(const [key,item] of marked){let p=parents.get(item.path);while(p){if(p===n){marked.delete(key);break;}p=parents.get(p.path);}}marked.set(n.path,n);}
 renderTables();drawMap();renderDetails();renderReview();renderMarked();
}
function renderMarked(){$('marked-count').textContent=marked.size;$('marked-summary').textContent=marked.size?marked.size+' marked · '+bytes([...marked.values()].reduce((s,n)=>s+n.size,0)):'';}
function render(){
 let chain=[],n=view;$('breadcrumbs').replaceChildren();while(n){chain.unshift(n);n=parents.get(n.path);}chain.forEach((item,i)=>{if(i)$('breadcrumbs').append(el('span','','/'));const b=el('button','',item.name);b.onclick=()=>go(item);$('breadcrumbs').append(b);});
 $('up').disabled=view===tree||scanning;$('tree-tab').classList.toggle('active',!fileMode);$('file-tab').classList.toggle('active',fileMode&&!largestMode);$('largest-files').classList.toggle('active',largestMode);
 $('file-count').textContent=view.files.toLocaleString()+' files';$('elapsed').textContent=elapsed.toFixed(1)+' seconds';
 $('volume-used').textContent=volume?bytes(volume.total-volume.free):'—';$('volume-free').textContent=volume?bytes(volume.free):'—';$('volume-total').textContent=volume?bytes(volume.total):'—';$('volume-bar').style.width=volume&&volume.total?(1-volume.free/volume.total)*100+'%':'0';
 renderTables();renderExtensions();drawMap();renderDetails();renderMarked();
}
function sorted(items){return [...items].sort((a,b)=>sortDirection*(sortKey==='name'?a.name.localeCompare(b.name):(a[sortKey]||0)-(b[sortKey]||0)));}
function matches(n){const q=$('search').value.toLowerCase();return (!q||n.path.toLowerCase().includes(q))&&(!extensionFilter||!n.directory&&ext(n)===extensionFilter);}
function allFiles(root){const items=[],stack=[root];while(stack.length){const n=stack.pop();if(n.directory)stack.push(...n.children);else items.push(n);}return items;}
function bar(percent){const track=el('div','mini-bar'),fill=el('div');fill.style.width=Math.min(100,Math.max(0,percent))+'%';track.append(fill);return track;}
function renderTables(){
 const tbody=$('tree-rows');tbody.replaceChildren();const query=$('search').value.toLowerCase();let rows=[];
 if(largestMode){rows=sorted(allFiles(tree).filter(matches)).slice(0,25).map(n=>[n,0]);}
 else if(fileMode||extensionFilter){rows=sorted(allFiles(view).filter(matches)).map(n=>[n,0]);}
 else {
  const contains=new Set();if(query)for(const n of index.values())if(matches(n)){let p=n;while(p){contains.add(p.path);p=parents.get(p.path);}}
  const walk=[{n:view,depth:0}];while(walk.length){const {n,depth}=walk.pop();if(query&&!contains.has(n.path))continue;rows.push([n,depth]);if(n.directory&&(expanded.has(n.path)||query)){const children=sorted(n.children);for(let i=children.length-1;i>=0;i--)walk.push({n:children[i],depth:depth+1});}if(rows.length>=1500)break;}
 }
 const count=rows.length;rows=rows.slice(0,1500);
 for(const [n,depth]of rows){
  const row=el('tr',(selection===n?'selected ':'')+(isMarked(n)?'marked':''));row.tabIndex=0;row.setAttribute('aria-label',n.name);
  const name=el('td');const content=el('div','name-cell');content.style.paddingLeft=Math.min(10,depth)*17+'px';
  if(n.directory&&!fileMode&&!extensionFilter){const expand=el('button','expand');expand.setAttribute('aria-label',(expanded.has(n.path)?'Collapse ':'Expand ')+n.name);expand.append(icon(expanded.has(n.path)?'caret-down':'caret-right'));expand.onclick=e=>{e.stopPropagation();expanded.has(n.path)?expanded.delete(n.path):expanded.add(n.path);renderTables();};content.append(expand);}
  else content.append(el('span','expand-spacer'));
  content.append(icon(n===tree?'hard-drives':n.directory?'folder':'file',n.directory?'folder':''),el('span','',n.name));name.append(content);
  const size=el('td');const sizes=el('div','size-cell');sizes.append(el('span','',bytes(n.size)));if(n!==view){const share=view.size?n.size/view.size*100:0;sizes.append(bar(share),el('small','',share.toFixed(1)+'%'));}size.append(sizes);
  row.append(name,size,el('td','numeric',bytes(n.allocated)),el('td','numeric',n.files.toLocaleString()),el('td','numeric',(n.folders||0).toLocaleString()),el('td','',new Date(n.modified).toLocaleString(undefined,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})));
  row.title=n.path+(n.incomplete?' · incomplete scan':'');row.onclick=e=>{if(e.ctrlKey||e.metaKey)toggleMark(n);else select(n);};row.ondblclick=()=>n.directory?go(n):$('details-dialog').showModal();row.oncontextmenu=e=>{e.preventDefault();select(n);$('details-dialog').showModal();};tbody.append(row);
 }
 $('table-note').hidden=count>0&&count<1500;$('table-note').textContent=count>=1500?'Showing the first 1,500 matches. Narrow your search.':largestMode&&count?'Showing the '+count+' largest files in this scan.':'No matching files or folders.';
}
function renderExtensions(){
 const totals=new Map();for(const n of allFiles(view)){const extension=ext(n);totals.set(extension,(totals.get(extension)||0)+n.size);}
 extensionRows=[...totals].map(([extension,size])=>({extension,size}));
 extensionRows.sort((a,b)=>extSort==='extension'?a.extension.localeCompare(b.extension):b.size-a.size);
 $('extension-rows').replaceChildren();
 for(const item of extensionRows){const [description,shade]=extensions[item.extension]||['Other Files','#8794a3'];const row=el('tr',extensionFilter===item.extension?'selected':'');const name=el('td'),cell=el('div','extension-cell'),swatch=el('span','swatch');swatch.style.background=shade;cell.append(swatch,el('span','',item.extension));name.append(cell);const pct=view.size?item.size/view.size*100:0;const percent=el('td');const content=el('div','extension-percent');content.append(bar(pct),el('small','',pct.toFixed(1)+'%'));percent.append(content);row.append(name,el('td','',description),el('td','numeric',bytes(item.size)),percent);row.title='Click to filter '+item.extension+' files';row.onclick=()=>{extensionFilter=extensionFilter===item.extension?null:item.extension;fileMode=!!extensionFilter;render();};$('extension-rows').append(row);}
}
function split(items,x,y,w,h,emit){
 if(!items.length||w<=0||h<=0)return;
 const total=items.reduce((sum,n)=>sum+n.size,0),scale=w*h/total;
 const entries=items.map(n=>({n,area:n.size*scale}));let position=0;
 const worst=(row,side)=>{const sum=row.reduce((s,e)=>s+e.area,0),areas=row.map(e=>e.area);return Math.max(side*side*Math.max(...areas)/(sum*sum),sum*sum/(side*side*Math.min(...areas)));};
 while(position<entries.length){
  const side=Math.min(w,h),row=[entries[position++]];
  while(position<entries.length&&worst([...row,entries[position]],side)<=worst(row,side))row.push(entries[position++]);
  const sum=row.reduce((s,e)=>s+e.area,0);
  if(w>=h){const width=sum/h;let offset=y;for(const e of row){const height=e.area/width;emit(e.n,x,offset,width,height);offset+=height;}x+=width;w=Math.max(0,w-width);}
  else{const height=sum/w;let offset=x;for(const e of row){const width=e.area/height;emit(e.n,offset,y,width,height);offset+=width;}y+=height;h=Math.max(0,h-height);}
 }
}
function drawMap(){
 if(!view)return;const map=$('treemap');map.replaceChildren();const canvas=el('div','map-canvas');const w=map.clientWidth*zoom/100,h=map.clientHeight*zoom/100;canvas.style.width=w+'px';canvas.style.height=h+'px';map.append(canvas);
 function draw(parent,x,y,width,height,level){
  const entries=parent.children.filter(n=>n.size>0).sort((a,b)=>b.size-a.size);
  split(entries,x,y,width,height,(n,tx,ty,tw,th)=>{
   const gap=settings.gap;if(tw<gap+3||th<gap+3)return;
   const nested=level>1,tile=el('button','tile'+(nested?' nested':'')+(!nested&&tw<210?' compact':'')+(n===selection?' selected':'')+(isMarked(n)?' marked':'')+(!matches(n)?' filtered':''));
   Object.assign(tile.style,{left:tx+gap/2+'px',top:ty+gap/2+'px',width:tw-gap+'px',height:th-gap+'px'});tile.style.setProperty('--tile',color(n));tile.setAttribute('aria-label',n.name+', '+bytes(n.size));tile.title=n.path+' · '+bytes(n.size);
   tile.onclick=e=>{e.stopPropagation();e.ctrlKey||e.metaKey?toggleMark(n):select(n);};tile.ondblclick=e=>{e.stopPropagation();n.directory?go(n):$('details-dialog').showModal();};tile.oncontextmenu=e=>{e.preventDefault();select(n);$('details-dialog').showModal();};
   canvas.append(tile);
   const drawNested=n.children.length&&level<settings.depth&&tw>95&&th>65;
   if(drawNested)draw(n,tx,ty,tw,th,level+1);
   if(settings.labels&&tw>100&&th>85&&(level===1||!n.children.length&&tw>150&&th>90)){
    const caption=el('span','tile-caption'),text=el('div');text.append(el('strong','',n.name),el('small','',bytes(n.size)));caption.append(icon(/^windows$/i.test(n.name)?'windows-logo':category(n)==='video'?'film-strip':category(n)==='media'?'image':category(n)==='application'?'cube':n.directory?'folder':'file'),text);
    if(drawNested){const label=el('button','tile folder-caption'+(tw<210?' compact':'')+(n===selection?' selected':'')+(isMarked(n)?' marked':''));const labelHeight=Math.min(Math.max(th*.42,90),th*.84,120);Object.assign(label.style,{left:tx+tw*.04+'px',top:ty+(th-labelHeight)/2+'px',width:Math.min(tw*.92,270)+'px',height:labelHeight+'px'});label.style.setProperty('--tile',color(n));label.append(caption);label.setAttribute('aria-label','Folder '+n.name+', '+bytes(n.size));label.onclick=tile.onclick;label.ondblclick=tile.ondblclick;label.oncontextmenu=tile.oncontextmenu;canvas.append(label);}else tile.append(caption);
   }
  });
 }
 if(!view.children.some(n=>n.size>0)){map.replaceChildren(el('div','empty','No measurable files in this folder.'));return;}
 draw(view,0,0,w,h,1);
}
function renderDetails(){
 $('selection-name').textContent=selection.name;$('selection-path').textContent=selection.path;$('selection-size').textContent=bytes(selection.size);
 $('selection-share').textContent=(view.size?selection.size/view.size*100:0).toFixed(1)+'% of this folder'+(selection.incomplete?' · incomplete scan':'');
 $('selection-type').textContent=selection.directory?'Folder':'File';$('selection-files').textContent=selection.files.toLocaleString();$('selection-date').textContent=new Date(selection.modified).toLocaleString();
 $('explore').disabled=!selection.directory||selection===view||scanning;$('reveal').disabled=demo||scanning;$('mark').disabled=selection===tree||scanning;$('mark').textContent=marked.has(selection.path)?'Remove from review':'Add to review';
}
function applySettings(){
 document.body.classList.toggle('dark',settings.theme==='dark'||settings.theme==='eclipse'||settings.theme==='aurora'||settings.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.body.classList.toggle('eclipse',settings.theme==='eclipse');
 document.body.classList.toggle('aurora',settings.theme==='aurora');
 document.documentElement.style.setProperty('--accent',settings.accent);document.documentElement.style.setProperty('--row',28*settings.scale/100+'px');
 document.documentElement.style.fontSize=14*settings.scale/100+'px';
 document.body.style.zoom=settings.scale/100;document.body.style.height=10000/settings.scale+'vh';
 for(const key of Object.keys(defaults)){const control=$(key);if(control.type==='checkbox')control.checked=settings[key];else control.value=settings[key];}
 $('scale-value').textContent=settings.scale+'%';$('gap-value').textContent=settings.gap+'px';
 try{localStorage.setItem('entree-settings-v2',JSON.stringify(settings));localStorage.setItem('entree-eclipse-applied-v1','1');localStorage.setItem('entree-aurora-background-v1','1');localStorage.setItem('entree-ocean-aurora-palette-v1','1');}catch{toast('Settings could not be saved on this device.');}
 if(tree)render();
}
function renderReview(){
 $('review-items').replaceChildren();for(const n of marked.values()){const row=el('div','review-item'),text=el('div');text.append(el('strong','',n.name),el('small','',n.path),el('em','',bytes(n.size)));const remove=el('button','','Remove');remove.onclick=()=>toggleMark(n);row.append(text,remove);$('review-items').append(row);}
 if(!marked.size)$('review-items').append(el('p','','No marked items. Right-click an item for Details, then Add to review; or Ctrl/Cmd-click a tile.'));
 $('review-total').textContent=bytes([...marked.values()].reduce((s,n)=>s+n.size,0))+' in '+marked.size+' item(s)';$('trash').disabled=demo||!marked.size||scanning;$('trash').textContent=demo?'Demo · no files changed':'Move to Trash';$('export').disabled=!marked.size;
}
function setScanning(value){scanning=value;$('cancel').hidden=!value;for(const id of ['choose','scan','rescan','demo','review','drive','largest-files','export-summary'])$(id).disabled=value;if(tree)renderDetails();}
async function scanFolder(root){scanStarted=performance.now();setScanning(true);$('status').textContent='Scanning…';marked.clear();renderMarked();try{await window.entree.scan(root,{hidden:settings.hidden});}catch(e){setScanning(false);demo=true;$('source-badge').textContent='PREVIOUS VIEW · READ ONLY';renderDetails();toast(e.message);}}
$('choose').onclick=async()=>{if(!window.entree){toast('Browser demo: run the desktop app to scan your files.');return;}try{const folder=await window.entree.chooseFolder();if(folder){let option=[...$('drive').options].find(o=>o.value===folder);if(!option){option=el('option','',folder);option.value=folder;$('drive').append(option);}$('drive').value=folder;await scanFolder(folder);}}catch(e){toast(e.message);}};
$('scan').onclick=()=>{const root=$('drive').value;if(root==='demo')showDemo();else scanFolder(root);};
$('rescan').onclick=()=>demo?showDemo():scanFolder(tree.path);
$('cancel').onclick=async()=>{await window.entree.cancel();setScanning(false);demo=true;$('source-badge').textContent='PREVIOUS VIEW · READ ONLY';$('status').textContent='Scan canceled';renderDetails();};
$('demo').onclick=()=>{$('drive').value='demo';showDemo();};$('up').onclick=up;
$('details').onclick=()=>{$('details-dialog').showModal();};
$('explore').onclick=()=>{$('details-dialog').close();go(selection);};
$('reveal').onclick=async()=>{try{await window.entree.reveal(selection.path);}catch(e){toast(e.message);}};
$('mark').onclick=()=>toggleMark();
$('settings').onclick=()=>$('settings-dialog').showModal();
$('review').onclick=()=>{renderReview();$('review-dialog').showModal();};
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('tree-tab').onclick=()=>{fileMode=false;largestMode=false;extensionFilter=null;render();};$('file-tab').onclick=()=>{fileMode=true;largestMode=false;extensionFilter=null;render();};
$('largest-files').onclick=()=>{largestMode=!largestMode;fileMode=largestMode;extensionFilter=null;sortKey='size';sortDirection=-1;$('status').textContent=largestMode?'Top 25 largest files · '+(demo?'sample data':'local scan'):'Scan complete';render();};
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sortDirection=sortKey===b.dataset.sort?-sortDirection:-1;sortKey=b.dataset.sort;renderTables();});
document.querySelectorAll('[data-ext-sort]').forEach(b=>b.onclick=()=>{extSort=b.dataset.extSort;renderExtensions();});
$('search').oninput=()=>{renderTables();drawMap();};
 for(const key of Object.keys(defaults))$(key).oninput=()=>{const c=$(key);settings[key]=c.type==='checkbox'?c.checked:['scale','gap','depth'].includes(key)?Number(c.value):c.value;if(key==='theme'&&settings.theme==='eclipse'){settings.accent='#ffb454';settings.palette='eclipse';}else if(key==='theme'&&settings.theme==='aurora'){settings.accent='#16d7e5';settings.palette='aurora';}applySettings();};
$('reset-settings').onclick=()=>{settings={...defaults};applySettings();};
function changeZoom(value){zoom=Math.min(300,Math.max(100,value));$('zoom').value=zoom;drawMap();}
$('zoom').oninput=()=>changeZoom(Number($('zoom').value));$('zoom-out').onclick=()=>changeZoom(zoom-20);$('zoom-in').onclick=()=>changeZoom(zoom+20);$('fit').onclick=()=>changeZoom(100);
$('export').onclick=()=>{const data=JSON.stringify({app:'ENTree',generated:new Date().toISOString(),root:tree.path,demo,items:[...marked.values()].map(n=>({path:n.path,apparentBytes:n.size}))},null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=el('a');a.href=url;a.download='entree-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('export-summary').onclick=()=>{if(!tree)return;const files=allFiles(tree),byCategory={};for(const n of files){const key=category(n);byCategory[key]=(byCategory[key]||0)+n.size;}const summary={app:'ENTree',generated:new Date().toISOString(),source:demo?'sample demo data — not a live PC scan':'local scan',root:tree.path,totals:{files:tree.files,folders:tree.folders,apparentBytes:tree.size,allocatedBytes:tree.allocated,volumeBytes:volume?.total??null,freeBytes:volume?.free??null},scanStats:stats,categories:byCategory,largestFiles:[...files].sort((a,b)=>b.size-a.size||a.name.localeCompare(b.name)).slice(0,25).map(n=>({name:n.name,path:n.path,apparentBytes:n.size,category:category(n)}))};const url=URL.createObjectURL(new Blob([JSON.stringify(summary,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='entree-scan-summary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Scan summary exported. '+(demo?'Sample data is labeled in the file.':'Local scan data stays on this device.'));};
$('trash').onclick=async()=>{if(demo||!marked.size)return;$('trash').disabled=true;try{const result=await window.entree.trash([...marked.keys()]);if(result.canceled){renderReview();return;}$('review-dialog').close();toast(result.errors?.length?result.moved+' moved. '+result.errors.map(e=>e.path+': '+e.message).join('; '):result.moved+' item(s) moved to Trash.');await scanFolder(tree.path);}catch(e){toast(e.message);renderReview();}};
document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>window.entree?window.entree.windowControl(b.dataset.window):toast('Window controls are available in the desktop app.'));
document.addEventListener('keydown',e=>{if(e.target.matches('input,select')||document.querySelector('dialog[open]'))return;if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();up();}if(e.key==='Enter'){e.preventDefault();go(selection);}if(e.key===' '){e.preventDefault();toggleMark();}});
if(window.entree){window.entree.onScan(msg=>{if(msg.type==='progress')$('status').textContent='Scanning · '+msg.entries.toLocaleString()+' entries…';else if(msg.type==='complete')load(msg.result,false);else if(msg.type==='error'){setScanning(false);demo=true;$('source-badge').textContent='PREVIOUS VIEW · READ ONLY';$('status').textContent='Scan failed';renderDetails();toast(msg.message);}});window.entree.drives().then(drives=>{for(const d of drives){const option=el('option','',d.label);option.value=d.path;$('drive').append(option);}}).catch(()=>toast('Drive list unavailable. Use Open folder.'));}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(settings.theme==='system')applySettings();});
new ResizeObserver(()=>{if(tree)drawMap();}).observe($('treemap'));
applySettings();showDemo();

