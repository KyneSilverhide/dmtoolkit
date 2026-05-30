const express = require('express')
const path = require('path')
const fs = require('fs')
const pool = require('../db')

const router = express.Router()
const UPLOADS_DIR = path.join(__dirname, '../../uploads')

function buildRelayScript(seed) {
  return `<script>
(function(seed){
  var s=seed>>>0;
  Math.random=function(){
    s=s+0x6D2B79F5|0;
    var t=Math.imul(s^s>>>15,1|s);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
  function getPath(el){
    var p=[],cur=el;
    while(cur&&cur!==document.body&&cur.parentElement){
      p.unshift(Array.from(cur.parentElement.children).indexOf(cur));
      cur=cur.parentElement;
    }
    return p;
  }
  function getByPath(p){
    var el=document.body;
    for(var i=0;i<p.length;i++){
      if(!el||!el.children[p[i]])return null;
      el=el.children[p[i]];
    }
    return el;
  }
  var relaying=false;
  document.addEventListener('click',function(e){
    if(relaying)return;
    var p=getPath(e.target);
    window.parent.postMessage({type:'puzzle-click',path:p},'*');
  },true);
  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='puzzle-remote-click')return;
    var el=getByPath(e.data.path);
    if(!el)return;
    relaying=true;
    el.click();
    relaying=false;
  });
})(${seed});
<\/script>`
}

// GET /api/puzzles/serve/:imageId?seed=SEED — public (no auth, players need access)
router.get('/serve/:imageId', async (req, res) => {
  try {
    const imageId = parseInt(req.params.imageId, 10)
    const seed = parseInt(req.query.seed, 10)
    if (!Number.isInteger(imageId) || imageId <= 0) return res.status(400).send('Invalid ID.')
    if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) return res.status(400).send('Invalid seed.')

    const { rows } = await pool.query(
      "SELECT url FROM session_images WHERE id = $1 AND type = 'puzzle'",
      [imageId]
    )
    if (!rows[0]) return res.status(404).send('Puzzle not found.')

    const relPath = rows[0].url.replace(/^\/uploads\//, '')
    const filePath = path.resolve(UPLOADS_DIR, relPath)
    if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return res.status(403).send('Forbidden.')

    const html = fs.readFileSync(filePath, 'utf8')
    const script = buildRelayScript(seed)

    let injected = html.replace(/(<head\b[^>]*>)/i, `$1\n${script}`)
    if (injected === html) injected = script + '\n' + html

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(injected)
  } catch (err) {
    console.error('[puzzles] serve error:', err)
    res.status(500).send('Server error.')
  }
})

module.exports = router
