// Lightweight resource logger — reports the CONTAINER's real memory usage
// (from cgroups, so it includes the Chromium child processes, not just Node)
// against its limit, plus disk. Lets the Render logs show if it's OOM.
const fs = require('fs');

const mb = (b) => Math.round(b / 1024 / 1024);

function readCgroupMem() {
  try {
    // cgroup v2 (modern Docker / Render)
    if (fs.existsSync('/sys/fs/cgroup/memory.current')) {
      const used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim(), 10);
      const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
      const max = raw === 'max' ? null : parseInt(raw, 10);
      return { used, max };
    }
    // cgroup v1
    if (fs.existsSync('/sys/fs/cgroup/memory/memory.usage_in_bytes')) {
      const used = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim(), 10);
      const max = parseInt(fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim(), 10);
      return { used, max: max > 1e15 ? null : max }; // huge limit == "unlimited"
    }
  } catch (_) { /* not on a cgroup host */ }
  return null;
}

function diskInfo(path) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const s = fs.statfsSync(path || '/');
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, used: total - free };
  } catch (_) {
    return null;
  }
}

function memSnapshot() {
  const m = process.memoryUsage();
  let s = `node.rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}MB ext=${mb(m.external)}MB`;
  const cg = readCgroupMem();
  if (cg) {
    s += ` | container=${mb(cg.used)}MB`;
    if (cg.max) s += `/${mb(cg.max)}MB (${Math.round((cg.used / cg.max) * 100)}%)`;
  }
  const d = diskInfo('/');
  if (d && d.total) s += ` | disk ${mb(d.used)}/${mb(d.total)}MB (${Math.round((d.used / d.total) * 100)}% used)`;
  return s;
}

function startMemoryMonitor(intervalMs, logFn) {
  const tick = () => {
    try { logFn(`[resources] ${memSnapshot()}`); } catch (_) { /* ignore */ }
  };
  tick();
  const t = setInterval(tick, intervalMs);
  if (t.unref) t.unref();
  return t;
}

module.exports = { memSnapshot, startMemoryMonitor, readCgroupMem, diskInfo };
