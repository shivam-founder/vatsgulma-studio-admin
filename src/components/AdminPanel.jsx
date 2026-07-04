import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
  LayoutDashboard, Music, Disc3, Users as UsersIcon, Plus, Pencil, Trash2, X,
  Upload, Image as ImageIcon, Video as VideoIcon, Search, ChevronDown,
  AlertTriangle, Settings, UserPlus, Headphones, Check, RefreshCw, LogOut
} from 'lucide-react';

/* =========================================================================
   SUPABASE CONFIG
   The anon key is meant to be public (it's what ships in any browser build),
   so it's safe to keep here. Real access control happens through the RLS
   policies described in supabase-setup.sql.
   ========================================================================= */
const SUPABASE_URL = 'https://prvksfhmvmketlbvkxgm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBydmtzZmhtdm1rZXRsYnZreGdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjIyMzksImV4cCI6MjA5Nzk5ODIzOX0.lUhRBviurfO6fTfl8_oahE2viaUvSrArUka8NXVtJKw';
const BUCKET = 'songs-media';
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // a play in the last 5 min counts as "listening now"

/* =========================================================================
   THIN SUPABASE REST/STORAGE/AUTH CLIENT (no SDK — see note at bottom of file)
   ========================================================================= */
function authHeaders(token) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
}
async function sbGet(path, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
async function sbPost(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
async function sbPatch(path, body, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
async function sbDelete(path, token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: authHeaders(token) });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
}
async function sbUpload(objectPath, file, token) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  return objectPath;
}
function publicUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
async function sbSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Sign-in failed. Check the email and password.');
  return data;
}
function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
function newId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* =========================================================================
   HELPERS
   ========================================================================= */
function formatNumber(n) { return (n || 0).toLocaleString('en-US'); }
function formatDuration(sec) {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} wk${weeks > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  return `${months} mo${months > 1 ? 's' : ''} ago`;
}
function isNewProfile(createdAt) {
  if (!createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) < 7 * 86400000;
}
function displayName(profile) {
  return profile.display_name || profile.username || profile.email || 'Unnamed user';
}
function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function nameHue(name) {
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/* =========================================================================
   SMALL UI ATOMS
   ========================================================================= */
function Waveform({ active = true, size = 'md' }) {
  const bars = size === 'sm' ? 4 : 6;
  return (
    <span className={`vg-wave vg-wave--${size} ${active ? 'is-active' : ''}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} className="vg-wave__bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </span>
  );
}

function Avatar({ name, size = 36, src }) {
  if (src) {
    return <img src={src} alt="" className="vg-avatar" style={{ width: size, height: size, minWidth: size, objectFit: 'cover' }} />;
  }
  const hue = nameHue(name);
  return (
    <span
      className="vg-avatar"
      style={{ width: size, height: size, minWidth: size, background: `hsl(${hue} 40% 24%)`, color: `hsl(${hue} 65% 76%)`, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

function Badge({ children, tone = 'default' }) {
  return <span className={`vg-badge vg-badge--${tone}`}>{children}</span>;
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="vg-stat-card">
      <div className="vg-stat-top">
        <span className="vg-stat-label">{label}</span>
        {Icon && <Icon size={16} color={accent || 'var(--vg-text-muted)'} />}
      </div>
      <div className="vg-stat-value">{value}</div>
    </div>
  );
}

function CoverThumb({ url, size = 42, rounded = 10 }) {
  if (url) {
    return <img src={url} alt="" className="vg-cover-thumb" style={{ width: size, height: size, borderRadius: rounded }} />;
  }
  return (
    <span className="vg-cover-placeholder" style={{ width: size, height: size, borderRadius: rounded }}>
      <Music size={Math.round(size * 0.42)} />
    </span>
  );
}

function EmptyState({ icon: Icon, title, message }) {
  return (
    <div className="vg-empty">
      <Icon size={26} />
      <div className="vg-empty-title">{title}</div>
      <div className="vg-empty-message">{message}</div>
    </div>
  );
}

/* =========================================================================
   CONFIRM DIALOG
   ========================================================================= */
function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="vg-overlay" onClick={onCancel}>
      <div className="vg-modal vg-modal--sm" onClick={(e) => e.stopPropagation()}>
        <div className="vg-confirm-icon"><AlertTriangle size={20} /></div>
        <div className="vg-modal-title">{title}</div>
        <p className="vg-confirm-message">{message}</p>
        <div className="vg-modal-actions">
          <button className="vg-btn vg-btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="vg-btn vg-btn--danger vg-btn--solid" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   LOGIN GATE
   ========================================================================= */
function LoginGate({ onSignedIn, onSkip }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    if (!email.trim() || !password) { setError('Enter both email and password.'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await sbSignIn(email.trim(), password);
      onSignedIn({ token: data.access_token, user: data.user });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vg-login-screen">
      <div className="vg-login-card">
        <div className="vg-brand-name">Vatsagulma</div>
        <div className="vg-brand-sub">STUDIO ADMIN</div>
        <p className="vg-login-copy">Sign in with your Supabase admin account to add, edit, and remove songs.</p>
        <div className="vg-field">
          <label className="vg-label">Email</label>
          <input className="vg-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
        </div>
        <div className="vg-field">
          <label className="vg-label">Password</label>
          <input
            className="vg-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSignIn(); }}
            placeholder="••••••••"
          />
        </div>
        {error && <div className="vg-error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="vg-btn vg-btn--primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleSignIn} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <button className="vg-btn vg-btn--ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={onSkip}>
          Continue without login
        </button>
        <p className="vg-hint" style={{ marginTop: 14 }}>
          No admin account yet? Create one under Authentication → Users in Supabase, then set <code>is_admin = true</code> on
          that user's row in <code>profiles</code>. See <code>supabase-setup.sql</code> for the required policies.
        </p>
      </div>
    </div>
  );
}
/* =========================================================================
   SONG MODAL (add / edit) — uploads files to Storage, then writes the row
   ========================================================================= */
function SongModal({ mode, initialData, albumNames, token, userId, onClose, onSaved }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [artist, setArtist] = useState(initialData?.artist || '');
  const [album, setAlbum] = useState(initialData?.album || '');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(publicUrl(initialData?.cover_path) || null);
  const [mp3File, setMp3File] = useState(null);
  const [mp3Name, setMp3Name] = useState(initialData?.audio_path ? initialData.audio_path.split('/').pop() : null);
  const [duration, setDuration] = useState(initialData?.duration_sec || null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState(initialData?.video_path ? initialData.video_path.split('/').pop() : null);
  const [videoPreview, setVideoPreview] = useState(publicUrl(initialData?.video_path) || null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  function handleCoverChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }
  function handleMp3Change(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMp3File(file);
    setMp3Name(file.name);
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (isFinite(audio.duration)) setDuration(Math.round(audio.duration));
    });
    setErrors((prev) => ({ ...prev, mp3: undefined }));
  }
  function handleVideoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setVideoFile(file);
    setVideoName(file.name);
    setVideoPreview(URL.createObjectURL(file));
  }

  function validate() {
    const next = {};
    if (!title.trim()) next.title = 'Song name is required.';
    if (!artist.trim()) next.artist = 'Artist name is required.';
    if (mode === 'add' && !mp3File) next.mp3 = 'An MP3 file is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveError('');
    try {
      let audio_path = initialData?.audio_path || null;
      let cover_path = initialData?.cover_path || null;
      let video_path = initialData?.video_path || null;

      if (mp3File) audio_path = await sbUpload(`audio/${newId()}-${sanitizeFileName(mp3File.name)}`, mp3File, token);
      if (coverFile) cover_path = await sbUpload(`covers/${newId()}-${sanitizeFileName(coverFile.name)}`, coverFile, token);
      if (videoFile) video_path = await sbUpload(`videos/${newId()}-${sanitizeFileName(videoFile.name)}`, videoFile, token);

      const payload = {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim() || null,
        audio_path,
        cover_path,
        video_path,
        duration_sec: duration || null,
      };

      if (mode === 'add') {
        payload.uploader_id = userId || null;
        await sbPost('songs', payload, token);
      } else {
        await sbPatch(`songs?id=eq.${initialData.id}`, payload, token);
      }
      onSaved();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vg-overlay" onClick={() => !saving && onClose()}>
      <div className="vg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vg-modal-header">
          <div className="vg-modal-title">{mode === 'add' ? 'Add song' : 'Edit song'}</div>
          <button className="vg-icon-btn vg-btn--ghost" onClick={onClose} aria-label="Close" disabled={saving}><X size={18} /></button>
        </div>

        <div className="vg-field">
          <label className="vg-label">Song name</label>
          <input className="vg-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Tanpura Dreams" />
          {errors.title && <span className="vg-error">{errors.title}</span>}
        </div>

        <div className="vg-field">
          <label className="vg-label">Artist</label>
          <input className="vg-input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. Arjun Mehta" />
          {errors.artist && <span className="vg-error">{errors.artist}</span>}
        </div>

        <div className="vg-field">
          <label className="vg-label">Album <span className="vg-label-optional">(optional — pick one or type a new name)</span></label>
          <input className="vg-input" list="vg-album-options" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="e.g. Midnight Ragas" />
          <datalist id="vg-album-options">
            {albumNames.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>

        <div className="vg-field-row">
          <div className="vg-field" style={{ flex: '0 0 auto' }}>
            <label className="vg-label">Cover image</label>
            <label className="vg-file-drop vg-file-drop--square">
              {coverPreview ? <img src={coverPreview} alt="" className="vg-cover-preview" /> : <ImageIcon size={20} />}
              <input type="file" accept="image/*" onChange={handleCoverChange} hidden />
            </label>
          </div>

          <div className="vg-field" style={{ flex: 1 }}>
            <label className="vg-label">MP3 file</label>
            <label className="vg-file-drop">
              <Upload size={16} />
              <span className="vg-file-drop-text">
                {mp3Name || 'Choose an audio file'}
                {duration ? <span className="vg-file-drop-meta"> · {formatDuration(duration)}</span> : null}
              </span>
              <input type="file" accept="audio/*" onChange={handleMp3Change} hidden />
            </label>
            {errors.mp3 && <span className="vg-error">{errors.mp3}</span>}
            {mp3Name && <div className="vg-mp3-preview"><Waveform active size="sm" /><span>ready to upload</span></div>}
          </div>
        </div>

        <div className="vg-field">
          <label className="vg-label">Video <span className="vg-label-optional">(optional, no audio)</span></label>
          <label className="vg-file-drop">
            <VideoIcon size={16} />
            <span className="vg-file-drop-text">{videoName || 'Choose a muted background video'}</span>
            <input type="file" accept="video/*" onChange={handleVideoChange} hidden />
          </label>
          <span className="vg-hint">Plays muted as a visual backdrop behind the track — no audio track needed.</span>
          {videoPreview && <video src={videoPreview} className="vg-video-preview" muted loop autoPlay playsInline />}
        </div>

        {saveError && <div className="vg-error" style={{ marginBottom: 8 }}>{saveError}</div>}

        <div className="vg-modal-actions">
          <button className="vg-btn vg-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="vg-btn vg-btn--primary" onClick={handleSave} disabled={saving}>
            <Check size={15} /> {saving ? 'Saving…' : mode === 'add' ? 'Add song' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   CUSTOM CHART TOOLTIP
   ========================================================================= */
function ChartTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="vg-chart-tooltip">
      <div className="vg-chart-tooltip-title">{d.title}</div>
      <div className="vg-chart-tooltip-value">{formatNumber(d.playsCount)} plays</div>
    </div>
  );
}

/* =========================================================================
   DASHBOARD PAGE
   ========================================================================= */
function DashboardPage({ songs, profiles, nowPlayingByUser }) {
  const totalPlays = useMemo(() => songs.reduce((a, s) => a + s.playsCount, 0), [songs]);
  const activeUsers = profiles.filter((p) => {
    const last = nowPlayingByUser[p.id];
    return last && (Date.now() - new Date(last.played_at).getTime()) < ACTIVE_WINDOW_MS;
  });
  const newUsers = profiles.filter((p) => isNewProfile(p.created_at)).length;

  const topSongs = useMemo(
    () => [...songs].sort((a, b) => b.playsCount - a.playsCount).slice(0, 6).map((s) => ({ ...s, short: s.title.length > 16 ? s.title.slice(0, 15) + '…' : s.title })),
    [songs]
  );

  return (
    <>
      <div className="vg-stat-grid">
        <StatCard label="Total plays" value={formatNumber(totalPlays)} icon={Music} accent="var(--vg-amber)" />
        <StatCard label="Songs" value={formatNumber(songs.length)} icon={Disc3} />
        <StatCard label="Listening now" value={formatNumber(activeUsers.length)} icon={Headphones} accent="var(--vg-teal)" />
        <StatCard label="New users (7d)" value={formatNumber(newUsers)} icon={UserPlus} />
      </div>

      <div className="vg-dash-grid">
        <div className="vg-panel">
          <div className="vg-panel-title">Top songs by plays</div>
          {topSongs.length === 0 ? (
            <EmptyState icon={Music} title="No plays yet" message="Play counts will show up here once listeners start streaming songs." />
          ) : (
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={topSongs} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="short" width={110} tick={{ fill: 'var(--vg-text-muted)', fontSize: 12, fontFamily: 'var(--font-body)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(227,160,83,0.06)' }} />
                  <Bar dataKey="playsCount" radius={[0, 6, 6, 0]} barSize={16}>
                    {topSongs.map((_, i) => <Cell key={i} fill={i === 0 ? 'var(--vg-amber)' : 'var(--vg-amber-dim)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="vg-panel">
          <div className="vg-panel-title-row">
            <div className="vg-panel-title">Live now</div>
            <Waveform active size="sm" />
          </div>
          {activeUsers.length === 0 ? (
            <EmptyState icon={Headphones} title="Nobody's listening" message="Active listeners show up here based on recent plays." />
          ) : (
            <ul className="vg-live-list">
              {activeUsers.slice(0, 6).map((u) => {
                const song = nowPlayingByUser[u.id]?.songs;
                return (
                  <li key={u.id} className="vg-live-item">
                    <Avatar name={displayName(u)} size={32} src={u.avatar_url} />
                    <div className="vg-live-info">
                      <div className="vg-live-name">{displayName(u)}</div>
                      <div className="vg-live-song">{song ? `${song.title} · ${song.artist}` : 'Unknown track'}</div>
                    </div>
                    <Waveform active size="sm" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/* =========================================================================
   SONGS PAGE
   ========================================================================= */
function SongsPage({ songs, albumNames, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [albumFilter, setAlbumFilter] = useState('all');
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    let list = songs.filter((s) => {
      const matchesSearch = (s.title + ' ' + s.artist).toLowerCase().includes(search.toLowerCase());
      const matchesAlbum = albumFilter === 'all' || s.album === albumFilter;
      return matchesSearch && matchesAlbum;
    });
    list.sort((a, b) => (sortDir === 'desc' ? b.playsCount - a.playsCount : a.playsCount - b.playsCount));
    return list;
  }, [songs, search, albumFilter, sortDir]);

  return (
    <>
      <div className="vg-toolbar">
        <div className="vg-search">
          <Search size={15} />
          <input placeholder="Search songs or artists…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="vg-select-wrap vg-select-wrap--toolbar">
          <select className="vg-select" value={albumFilter} onChange={(e) => setAlbumFilter(e.target.value)}>
            <option value="all">All albums</option>
            {albumNames.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <ChevronDown size={15} className="vg-select-caret" />
        </div>
        <div className="vg-spacer" />
        <button className="vg-btn vg-btn--primary" onClick={onAdd}><Plus size={15} /> Add song</button>
      </div>

      {filtered.length === 0 ? (
        <div className="vg-table-wrap">
          <EmptyState icon={Music} title="No songs found" message="Try a different search, or add your first track." />
        </div>
      ) : (
        <div className="vg-table-wrap">
          <table className="vg-table">
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Album</th>
                <th onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')} className="vg-th-sortable">Plays {sortDir === 'desc' ? '↓' : '↑'}</th>
                <th>Duration</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><CoverThumb url={publicUrl(s.cover_path)} /></td>
                  <td>
                    <div className="vg-cell-title">{s.title}</div>
                    <div className="vg-cell-sub">{s.artist}</div>
                  </td>
                  <td>{s.album || '—'}</td>
                  <td className="vg-mono">{formatNumber(s.playsCount)}</td>
                  <td className="vg-mono">{formatDuration(s.duration_sec)}</td>
                  <td className="vg-mono vg-cell-sub">{formatDate(s.created_at)}</td>
                  <td>
                    <div className="vg-row-actions">
                      <button className="vg-icon-btn vg-btn--ghost" onClick={() => onEdit(s)} aria-label="Edit song"><Pencil size={15} /></button>
                      <button className="vg-icon-btn vg-btn--ghost vg-icon-btn--danger" onClick={() => onDelete(s)} aria-label="Delete song"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* =========================================================================
   ALBUMS PAGE (grouped view — "album" is a plain text field on songs)
   ========================================================================= */
function AlbumsPage({ songs }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of songs) {
      const key = s.album || 'Unsorted';
      if (!map.has(key)) map.set(key, { title: key, count: 0, coverUrl: null });
      const g = map.get(key);
      g.count += 1;
      if (!g.coverUrl && s.cover_path) g.coverUrl = publicUrl(s.cover_path);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [songs]);

  if (groups.length === 0) {
    return <div className="vg-table-wrap"><EmptyState icon={Disc3} title="No albums yet" message="Albums appear automatically once you tag songs with an album name." /></div>;
  }

  return (
    <div className="vg-album-grid">
      {groups.map((g) => (
        <div key={g.title} className="vg-album-card">
          <div className="vg-album-cover">{g.coverUrl ? <img src={g.coverUrl} alt="" /> : <Disc3 size={30} />}</div>
          <div className="vg-album-title">{g.title}</div>
          <div className="vg-album-meta">{g.count} song{g.count === 1 ? '' : 's'}</div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================================
   USERS PAGE
   ========================================================================= */
function UsersPage({ profiles, nowPlayingByUser }) {
  const [search, setSearch] = useState('');
  const [newOnly, setNewOnly] = useState(false);

  const newCount = profiles.filter((p) => isNewProfile(p.created_at)).length;
  const listeningCount = profiles.filter((p) => {
    const last = nowPlayingByUser[p.id];
    return last && (Date.now() - new Date(last.played_at).getTime()) < ACTIVE_WINDOW_MS;
  }).length;

  const filtered = profiles.filter((p) => {
    const name = displayName(p);
    const matchesSearch = (name + ' ' + (p.email || '')).toLowerCase().includes(search.toLowerCase());
    const matchesNew = !newOnly || isNewProfile(p.created_at);
    return matchesSearch && matchesNew;
  });

  return (
    <>
      <div className="vg-stat-grid vg-stat-grid--3">
        <StatCard label="Total users" value={formatNumber(profiles.length)} icon={UsersIcon} />
        <StatCard label="New this week" value={formatNumber(newCount)} icon={UserPlus} accent="var(--vg-teal)" />
        <StatCard label="Listening now" value={formatNumber(listeningCount)} icon={Headphones} accent="var(--vg-amber)" />
      </div>

      <div className="vg-toolbar">
        <div className="vg-search">
          <Search size={15} />
          <input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className={`vg-pill ${newOnly ? 'is-active' : ''}`} onClick={() => setNewOnly(!newOnly)}>
          <UserPlus size={13} /> New only
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="vg-table-wrap"><EmptyState icon={UsersIcon} title="No users found" message="Try a different search." /></div>
      ) : (
        <div className="vg-table-wrap">
          <table className="vg-table">
            <thead>
              <tr><th>User</th><th>Joined</th><th>Status</th><th>Now playing</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const last = nowPlayingByUser[p.id];
                const isActive = last && (Date.now() - new Date(last.played_at).getTime()) < ACTIVE_WINDOW_MS;
                const name = displayName(p);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="vg-user-cell">
                        <Avatar name={name} src={p.avatar_url} />
                        <div>
                          <div className="vg-cell-title">{name}</div>
                          <div className="vg-cell-sub">{p.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="vg-cell-sub"><span className="vg-mono">{timeAgo(p.created_at)}</span></td>
                    <td>{isNewProfile(p.created_at) ? <Badge tone="new">New</Badge> : <span className="vg-cell-sub">—</span>}</td>
                    <td>
                      {isActive ? (
                        <div className="vg-nowplaying">
                          <Waveform active size="sm" />
                          <span className="vg-cell-title">{last.songs?.title || 'Unknown track'}</span>
                          <span className="vg-cell-sub">· {last.songs?.artist}</span>
                        </div>
                      ) : (
                        <span className="vg-cell-sub">Not listening</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* =========================================================================
   SIDEBAR
   ========================================================================= */
function Sidebar({ active, onChange, activeListeners, mobileOpen, auth, onSignOut }) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'songs', label: 'Songs', icon: Music },
    { key: 'albums', label: 'Albums', icon: Disc3 },
    { key: 'users', label: 'Users', icon: UsersIcon },
  ];
  return (
    <aside className={`vg-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <div className="vg-brand">
        <div className="vg-brand-name">Vatsagulma</div>
        <div className="vg-brand-sub">STUDIO ADMIN</div>
      </div>
      <nav className="vg-nav">
        {items.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`vg-nav-item ${active === key ? 'is-active' : ''}`} onClick={() => onChange(key)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="vg-sidebar-footer">
        <div className="vg-live-chip">
          <span className="vg-live-dot" /><Headphones size={13} /><span>{activeListeners} listening now</span>
        </div>
        <div className="vg-admin-chip">
          <Avatar name={auth.user?.email || 'Guest'} size={28} />
          <div>
            <div className="vg-admin-name">{auth.user?.email || 'Not signed in'}</div>
            <div className="vg-admin-role">{auth.user ? 'Administrator' : 'Public access'}</div>
          </div>
          {auth.token ? (
            <button className="vg-icon-btn vg-btn--ghost" onClick={onSignOut} aria-label="Sign out"><LogOut size={15} /></button>
          ) : (
            <Settings size={15} className="vg-admin-gear" />
          )}
        </div>
      </div>
    </aside>
  );
}

/* =========================================================================
   TOPBAR
   ========================================================================= */
function Topbar({ title, subtitle, action, onMobileMenu, onRefresh, refreshing }) {
  return (
    <div className="vg-topbar">
      <button className="vg-mobile-menu" onClick={onMobileMenu} aria-label="Toggle menu"><span /><span /><span /></button>
      <div>
        <div className="vg-topbar-title-row">
          <div className="vg-page-title">{title}</div>
          <button className={`vg-icon-btn vg-btn--ghost vg-refresh-btn ${refreshing ? 'is-spinning' : ''}`} onClick={onRefresh} aria-label="Refresh data">
            <RefreshCw size={15} />
          </button>
        </div>
        {subtitle && <div className="vg-page-subtitle">{subtitle}</div>}
      </div>
      {action && (
        <button className="vg-btn vg-btn--primary vg-topbar-action" onClick={action.onClick}>
          {action.icon && <action.icon size={15} />} {action.label}
        </button>
      )}
    </div>
  );
}
/* =========================================================================
   APP
   ========================================================================= */
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [auth, setAuth] = useState({ token: null, user: null });
  const [skippedLogin, setSkippedLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [songs, setSongs] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [songModal, setSongModal] = useState({ open: false, mode: 'add', data: null });
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadAll(isBackground) {
    if (isBackground) setRefreshing(true); else setLoading(true);
    setLoadError('');
    try {
      const [songsData, profilesData, playsData] = await Promise.all([
        sbGet('songs?select=*,plays(count)&order=created_at.desc', auth.token),
        sbGet('profiles?select=*&order=created_at.desc', auth.token),
        sbGet('plays?select=*,songs(title,artist)&order=played_at.desc&limit=300', auth.token),
      ]);
      setSongs(songsData.map((s) => ({ ...s, playsCount: s.plays?.[0]?.count ?? 0 })));
      setProfiles(profilesData);
      setPlays(playsData);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!auth.token && !skippedLogin) return;
    loadAll(false);
    const interval = setInterval(() => loadAll(true), 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, skippedLogin]);

  const nowPlayingByUser = useMemo(() => {
    const map = {};
    for (const p of plays) {
      if (!p.user_id || map[p.user_id]) continue;
      map[p.user_id] = p;
    }
    return map;
  }, [plays]);

  const albumNames = useMemo(
    () => Array.from(new Set(songs.map((s) => s.album).filter(Boolean))).sort(),
    [songs]
  );

  const activeListeners = profiles.filter((p) => {
    const last = nowPlayingByUser[p.id];
    return last && (Date.now() - new Date(last.played_at).getTime()) < ACTIVE_WINDOW_MS;
  }).length;

  function openAddSong() { setSongModal({ open: true, mode: 'add', data: null }); }
  function openEditSong(song) { setSongModal({ open: true, mode: 'edit', data: song }); }
  function closeSongModal() { setSongModal({ open: false, mode: 'add', data: null }); }
  function handleSongSaved() {
    closeSongModal();
    setToast({ tone: 'success', message: songModal.mode === 'add' ? 'Song added.' : 'Song updated.' });
    loadAll(true);
  }

  function requestDeleteSong(song) {
    setConfirm({
      title: 'Delete this song?',
      message: `"${song.title}" will be permanently removed from the catalogue. Uploaded files stay in Storage — remove them there separately if needed.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await sbDelete(`songs?id=eq.${song.id}`, auth.token);
          setToast({ tone: 'success', message: 'Song deleted.' });
          loadAll(true);
        } catch (e) {
          setToast({ tone: 'error', message: `Delete failed: ${e.message}` });
        }
      },
    });
  }

  const topbarProps = {
    dashboard: { title: 'Dashboard', subtitle: 'Live from your Supabase project' },
    songs: { title: 'Songs', subtitle: `${songs.length} tracks across ${albumNames.length} albums`, action: { label: 'Add song', icon: Plus, onClick: openAddSong } },
    albums: { title: 'Albums', subtitle: 'Grouped automatically from each song\u2019s album name' },
    users: { title: 'Users', subtitle: 'Now playing is inferred from plays in the last 5 minutes' },
  }[activeTab];

  if (!auth.token && !skippedLogin) {
    return (
      <div className="vg-admin">
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .vg-admin, .vg-admin * { box-sizing: border-box; }
        .vg-admin {
          --vg-ink: #1A1420;
          --vg-surface: #241C2C;
          --vg-surface-raised: #2D2436;
          --vg-line: #3A2E44;
          --vg-amber: #E3A053;
          --vg-amber-dim: #7C5C39;
          --vg-teal: #57C7B4;
          --vg-danger: #E2685A;
          --vg-text: #F5EFE9;
          --vg-text-muted: #A997AC;
          --vg-text-faint: #6F6178;
          --font-display: 'Fraunces', serif;
          --font-body: 'Inter', -apple-system, sans-serif;
          --font-mono: 'IBM Plex Mono', monospace;

          display: flex;
          min-height: 100vh;
          background: var(--vg-ink);
          color: var(--vg-text);
          font-family: var(--font-body);
        }
        .vg-admin button { font-family: inherit; }
        .vg-admin input, .vg-admin select { font-family: inherit; }

        /* ---------- Sidebar ---------- */
        .vg-sidebar {
          width: 232px; flex-shrink: 0; background: var(--vg-surface);
          border-right: 1px solid var(--vg-line);
          display: flex; flex-direction: column; padding: 26px 16px 18px;
          position: sticky; top: 0; height: 100vh;
        }
        .vg-brand-name { font-family: var(--font-display); font-style: italic; font-weight: 600; font-size: 22px; padding-left: 4px; }
        .vg-brand-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; color: var(--vg-text-muted); margin-top: 3px; padding-left: 4px; }
        .vg-nav { margin-top: 30px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
        .vg-nav-item {
          display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 10px;
          color: var(--vg-text-muted); font-size: 14px; font-weight: 500; cursor: pointer;
          background: transparent; border: 1px solid transparent; text-align: left; transition: background .15s, color .15s;
        }
        .vg-nav-item:hover { background: var(--vg-surface-raised); color: var(--vg-text); }
        .vg-nav-item.is-active { background: var(--vg-surface-raised); color: var(--vg-amber); border-color: var(--vg-line); }
        .vg-sidebar-footer { display: flex; flex-direction: column; gap: 10px; }
        .vg-live-chip {
          display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--vg-text-muted);
          font-family: var(--font-mono); padding: 4px 6px;
        }
        .vg-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vg-teal); box-shadow: 0 0 0 0 rgba(87,199,180,0.6); animation: vgpulse 2s infinite; }
        @keyframes vgpulse { 0% { box-shadow: 0 0 0 0 rgba(87,199,180,0.55); } 70% { box-shadow: 0 0 0 6px rgba(87,199,180,0); } 100% { box-shadow: 0 0 0 0 rgba(87,199,180,0); } }
        .vg-admin-chip { display: flex; align-items: center; gap: 9px; padding: 9px; border-radius: 12px; border: 1px solid var(--vg-line); background: var(--vg-surface-raised); }
        .vg-admin-name { font-size: 12.5px; font-weight: 600; }
        .vg-admin-role { font-size: 10.5px; color: var(--vg-text-muted); }
        .vg-admin-gear { margin-left: auto; color: var(--vg-text-muted); }
        .vg-mobile-menu { display: none; }

        /* ---------- Main / Topbar ---------- */
        .vg-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .vg-topbar {
          display: flex; align-items: center; gap: 16px; justify-content: space-between;
          padding: 24px 32px; border-bottom: 1px solid var(--vg-line); flex-wrap: wrap;
        }
        .vg-page-title { font-family: var(--font-display); font-size: 27px; font-weight: 600; }
        .vg-page-subtitle { font-size: 13px; color: var(--vg-text-muted); margin-top: 4px; }
        .vg-content { padding: 26px 32px 60px; }

        /* ---------- Buttons ---------- */
        .vg-btn {
          font-weight: 600; font-size: 13.5px; padding: 10px 16px; border-radius: 10px;
          border: 1px solid var(--vg-line); background: var(--vg-surface-raised); color: var(--vg-text);
          cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: transform .08s, border-color .15s, background .15s;
          white-space: nowrap;
        }
        .vg-btn:hover { border-color: var(--vg-amber); }
        .vg-btn:active { transform: scale(0.97); }
        .vg-btn:focus-visible { outline: 2px solid var(--vg-teal); outline-offset: 2px; }
        .vg-btn--primary { background: var(--vg-amber); border-color: var(--vg-amber); color: #1A1420; }
        .vg-btn--primary:hover { background: #eeb472; border-color: #eeb472; }
        .vg-btn--ghost { background: transparent; border-color: transparent; }
        .vg-btn--ghost:hover { background: var(--vg-surface-raised); border-color: var(--vg-line); }
        .vg-btn--danger { color: var(--vg-danger); }
        .vg-btn--danger.vg-btn--solid { background: var(--vg-danger); border-color: var(--vg-danger); color: #1A1420; }
        .vg-icon-btn { padding: 8px; border-radius: 8px; }
        .vg-icon-btn--danger:hover { border-color: var(--vg-danger); color: var(--vg-danger); background: rgba(226,104,90,0.1); }

        /* ---------- Stat cards ---------- */
        .vg-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
        .vg-stat-grid--3 { grid-template-columns: repeat(3, 1fr); }
        .vg-stat-card { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 16px 18px; }
        .vg-stat-top { display: flex; align-items: center; justify-content: space-between; }
        .vg-stat-label { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--vg-text-muted); }
        .vg-stat-value { font-family: var(--font-display); font-size: 30px; margin-top: 8px; }

        /* ---------- Dashboard grid ---------- */
        .vg-dash-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
        .vg-panel { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 18px 20px; }
        .vg-panel-title { font-family: var(--font-display); font-size: 17px; font-weight: 600; margin-bottom: 12px; }
        .vg-panel-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .vg-panel-title-row .vg-panel-title { margin-bottom: 0; }

        .vg-live-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .vg-live-item { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-radius: 10px; }
        .vg-live-item:hover { background: var(--vg-surface-raised); }
        .vg-live-info { flex: 1; min-width: 0; }
        .vg-live-name { font-size: 13.5px; font-weight: 600; }
        .vg-live-song { font-size: 12px; color: var(--vg-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .vg-chart-tooltip { background: var(--vg-surface-raised); border: 1px solid var(--vg-line); border-radius: 8px; padding: 8px 12px; }
        .vg-chart-tooltip-title { font-size: 12.5px; font-weight: 600; }
        .vg-chart-tooltip-value { font-family: var(--font-mono); font-size: 11.5px; color: var(--vg-amber); margin-top: 2px; }

        /* ---------- Toolbar ---------- */
        .vg-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .vg-search {
          display: flex; align-items: center; gap: 8px; background: var(--vg-surface); border: 1px solid var(--vg-line);
          border-radius: 10px; padding: 9px 12px; color: var(--vg-text-muted); min-width: 220px; flex: 1; max-width: 320px;
        }
        .vg-search input { background: transparent; border: none; outline: none; color: var(--vg-text); font-size: 13.5px; width: 100%; }
        .vg-search:focus-within { border-color: var(--vg-teal); }
        .vg-spacer { flex: 1; }
        .vg-pill {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 99px;
          border: 1px solid var(--vg-line); background: var(--vg-surface); color: var(--vg-text-muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .vg-pill.is-active { background: rgba(87,199,180,0.14); border-color: var(--vg-teal); color: var(--vg-teal); }

        /* ---------- Select ---------- */
        .vg-select-wrap { position: relative; display: inline-flex; align-items: center; }
        .vg-select-wrap--toolbar { min-width: 160px; }
        .vg-select {
          appearance: none; -webkit-appearance: none; width: 100%; background: var(--vg-surface); border: 1px solid var(--vg-line);
          border-radius: 10px; padding: 9px 32px 9px 12px; color: var(--vg-text); font-size: 13.5px; cursor: pointer;
        }
        .vg-select:focus { outline: 2px solid var(--vg-teal); outline-offset: 1px; }
        .vg-select-caret { position: absolute; right: 10px; pointer-events: none; color: var(--vg-text-muted); }

        /* ---------- Table ---------- */
        .vg-table-wrap { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; overflow: hidden; overflow-x: auto; }
        .vg-table { width: 100%; border-collapse: collapse; min-width: 640px; }
        .vg-table th {
          text-align: left; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em;
          color: var(--vg-text-muted); padding: 13px 18px; border-bottom: 1px solid var(--vg-line); white-space: nowrap;
        }
        .vg-th-sortable { cursor: pointer; user-select: none; }
        .vg-th-sortable:hover { color: var(--vg-text); }
        .vg-table td { padding: 11px 18px; border-bottom: 1px solid var(--vg-line); font-size: 13.5px; vertical-align: middle; }
        .vg-table tr:last-child td { border-bottom: none; }
        .vg-table tr:hover td { background: rgba(227,160,83,0.035); }
        .vg-cell-title { font-weight: 600; font-size: 13.5px; }
        .vg-cell-sub { font-size: 12px; color: var(--vg-text-muted); }
        .vg-mono { font-family: var(--font-mono); font-size: 12.5px; }
        .vg-row-actions { display: flex; gap: 4px; }
        .vg-user-cell { display: flex; align-items: center; gap: 10px; }
        .vg-nowplaying { display: flex; align-items: center; gap: 7px; }

        /* ---------- Empty state ---------- */
        .vg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 20px; color: var(--vg-text-muted); }
        .vg-empty-title { font-family: var(--font-display); font-size: 16px; color: var(--vg-text); margin-top: 10px; }
        .vg-empty-message { font-size: 12.5px; margin-top: 4px; max-width: 280px; }

        /* ---------- Avatar / badge / waveform ---------- */
        .vg-avatar {
          border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;
          font-family: var(--font-mono); flex-shrink: 0;
        }
        .vg-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 99px; font-size: 10.5px; font-weight: 700; font-family: var(--font-mono); letter-spacing: .03em; }
        .vg-badge--new { background: rgba(87,199,180,0.15); color: var(--vg-teal); }
        .vg-badge--offline { background: rgba(169,151,172,0.12); color: var(--vg-text-muted); }
        .vg-album-badge { position: absolute; top: 10px; right: 10px; }

        .vg-wave { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
        .vg-wave__bar { width: 2.5px; background: var(--vg-teal); border-radius: 2px; height: 30%; }
        .vg-wave.is-active .vg-wave__bar { animation: vgwave 0.9s ease-in-out infinite; }
        @keyframes vgwave { 0%, 100% { height: 22%; } 50% { height: 100%; } }
        .vg-wave--sm { height: 12px; }
        .vg-wave--sm .vg-wave__bar { width: 2px; }

        /* ---------- Covers ---------- */
        .vg-cover-thumb { object-fit: cover; }
        .vg-cover-placeholder {
          display: inline-flex; align-items: center; justify-content: center; background: var(--vg-surface-raised);
          color: var(--vg-text-faint); border: 1px solid var(--vg-line);
        }

        /* ---------- Albums page ---------- */
        .vg-album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
        .vg-album-add {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          border: 1px dashed var(--vg-line); border-radius: 14px; background: transparent; color: var(--vg-text-muted);
          min-height: 190px; cursor: pointer; font-size: 13px; font-weight: 600;
        }
        .vg-album-add:hover { border-color: var(--vg-amber); color: var(--vg-amber); }
        .vg-album-card { position: relative; background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 14px; }
        .vg-album-cover {
          width: 100%; aspect-ratio: 1; border-radius: 10px; background: linear-gradient(155deg, var(--vg-surface-raised), var(--vg-ink));
          display: flex; align-items: center; justify-content: center; color: var(--vg-text-faint); overflow: hidden; margin-bottom: 10px;
        }
        .vg-album-cover img { width: 100%; height: 100%; object-fit: cover; }
        .vg-album-title { font-weight: 600; font-size: 14px; }
        .vg-album-meta { font-size: 11.5px; color: var(--vg-text-muted); margin-top: 2px; font-family: var(--font-mono); }
        .vg-album-delete { position: absolute; top: 10px; right: 10px; background: rgba(26,20,32,0.6); }

        /* ---------- Overlay / Modal ---------- */
        .vg-overlay {
          position: fixed; inset: 0; background: rgba(10,7,13,0.62); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px;
        }
        .vg-modal {
          background: var(--vg-surface-raised); border: 1px solid var(--vg-line); border-radius: 16px;
          width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; padding: 22px;
          animation: vgpop .15s ease-out;
        }
        .vg-modal--sm { max-width: 380px; }
        @keyframes vgpop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .vg-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .vg-modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 600; }
        .vg-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
        .vg-confirm-icon {
          width: 38px; height: 38px; border-radius: 10px; background: rgba(226,104,90,0.14); color: var(--vg-danger);
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .vg-confirm-message { font-size: 13.5px; color: var(--vg-text-muted); margin: 8px 0 0; line-height: 1.5; }

        /* ---------- Form fields ---------- */
        .vg-field { margin-bottom: 15px; display: flex; flex-direction: column; gap: 6px; }
        .vg-field-row { display: flex; gap: 12px; margin-bottom: 4px; }
        .vg-label { font-size: 12px; font-weight: 600; color: var(--vg-text-muted); }
        .vg-label-optional { font-weight: 400; color: var(--vg-text-faint); }
        .vg-input {
          background: var(--vg-ink); border: 1px solid var(--vg-line); border-radius: 9px; padding: 10px 12px;
          color: var(--vg-text); font-size: 13.5px;
        }
        .vg-input:focus { outline: 2px solid var(--vg-teal); outline-offset: 1px; border-color: var(--vg-teal); }
        .vg-error { font-size: 11.5px; color: var(--vg-danger); }
        .vg-hint { font-size: 11.5px; color: var(--vg-text-faint); }
        .vg-file-drop {
          border: 1px dashed var(--vg-line); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 9px;
          cursor: pointer; font-size: 12.5px; color: var(--vg-text-muted); background: var(--vg-ink);
        }
        .vg-file-drop:hover { border-color: var(--vg-amber); color: var(--vg-text); }
        .vg-file-drop--square { width: 68px; height: 68px; padding: 0; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .vg-file-drop-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vg-file-drop-meta { color: var(--vg-text-faint); }
        .vg-cover-preview { width: 100%; height: 100%; object-fit: cover; }
        .vg-mp3-preview { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--vg-teal); margin-top: 6px; }
        .vg-video-preview { width: 100%; max-height: 120px; border-radius: 9px; margin-top: 8px; object-fit: cover; background: #000; }


        /* ---------- Login screen ---------- */
        .vg-login-screen { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .vg-login-card { width: 100%; max-width: 360px; background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 16px; padding: 28px; }
        .vg-login-copy { font-size: 13px; color: var(--vg-text-muted); margin: 10px 0 18px; line-height: 1.5; }

        /* ---------- Banners / toast ---------- */
        .vg-banner {
          display: flex; align-items: flex-start; gap: 10px; background: rgba(226,104,90,0.1); border: 1px solid var(--vg-danger);
          color: var(--vg-danger); padding: 12px 16px; border-radius: 10px; margin-bottom: 18px; font-size: 12.5px; line-height: 1.5;
        }
        .vg-banner-text { flex: 1; }
        .vg-banner-retry { flex-shrink: 0; }
        .vg-toast {
          position: fixed; bottom: 20px; right: 20px; background: var(--vg-surface-raised); border: 1px solid var(--vg-line);
          padding: 12px 16px; border-radius: 10px; font-size: 13px; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.35); max-width: 320px;
        }
        .vg-toast--error { border-color: var(--vg-danger); color: var(--vg-danger); }
        .vg-toast--success { border-color: var(--vg-teal); color: var(--vg-teal); }
        .vg-loading-screen { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; color: var(--vg-text-muted); font-family: var(--font-mono); font-size: 12.5px; gap: 8px; }
        .vg-refresh-btn.is-spinning svg { animation: vgspin 0.8s linear infinite; }
        @keyframes vgspin { to { transform: rotate(360deg); } }
        .vg-topbar-title-row { display: flex; align-items: center; gap: 8px; }
        .vg-caveat { font-size: 11.5px; color: var(--vg-text-faint); margin-top: 2px; }

        /* ---------- Responsive ---------- */
        @media (max-width: 880px) {
          .vg-dash-grid { grid-template-columns: 1fr; }
          .vg-stat-grid, .vg-stat-grid--3 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 720px) {
          .vg-sidebar {
            position: fixed; z-index: 70; left: 0; top: 0; transform: translateX(-100%);
            transition: transform .2s ease; box-shadow: 20px 0 40px rgba(0,0,0,0.4);
          }
          .vg-sidebar.is-open { transform: translateX(0); }
          .vg-mobile-menu {
            display: flex; flex-direction: column; gap: 3px; justify-content: center; width: 32px; height: 32px;
            background: transparent; border: none; cursor: pointer; padding: 6px;
          }
          .vg-mobile-menu span { display: block; height: 2px; background: var(--vg-text); border-radius: 2px; }
          .vg-topbar { padding: 18px 16px; }
          .vg-content { padding: 18px 16px 50px; }
          .vg-stat-grid, .vg-stat-grid--3 { grid-template-columns: 1fr 1fr; gap: 10px; }
          .vg-stat-value { font-size: 24px; }
          .vg-field-row { flex-direction: column; }
        }
      `}</style>
        <LoginGate onSignedIn={(a) => setAuth(a)} onSkip={() => setSkippedLogin(true)} />
      </div>
    );
  }

  return (
    <div className="vg-admin">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .vg-admin, .vg-admin * { box-sizing: border-box; }
        .vg-admin {
          --vg-ink: #1A1420;
          --vg-surface: #241C2C;
          --vg-surface-raised: #2D2436;
          --vg-line: #3A2E44;
          --vg-amber: #E3A053;
          --vg-amber-dim: #7C5C39;
          --vg-teal: #57C7B4;
          --vg-danger: #E2685A;
          --vg-text: #F5EFE9;
          --vg-text-muted: #A997AC;
          --vg-text-faint: #6F6178;
          --font-display: 'Fraunces', serif;
          --font-body: 'Inter', -apple-system, sans-serif;
          --font-mono: 'IBM Plex Mono', monospace;

          display: flex;
          min-height: 100vh;
          background: var(--vg-ink);
          color: var(--vg-text);
          font-family: var(--font-body);
        }
        .vg-admin button { font-family: inherit; }
        .vg-admin input, .vg-admin select { font-family: inherit; }

        /* ---------- Sidebar ---------- */
        .vg-sidebar {
          width: 232px; flex-shrink: 0; background: var(--vg-surface);
          border-right: 1px solid var(--vg-line);
          display: flex; flex-direction: column; padding: 26px 16px 18px;
          position: sticky; top: 0; height: 100vh;
        }
        .vg-brand-name { font-family: var(--font-display); font-style: italic; font-weight: 600; font-size: 22px; padding-left: 4px; }
        .vg-brand-sub { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; color: var(--vg-text-muted); margin-top: 3px; padding-left: 4px; }
        .vg-nav { margin-top: 30px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
        .vg-nav-item {
          display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 10px;
          color: var(--vg-text-muted); font-size: 14px; font-weight: 500; cursor: pointer;
          background: transparent; border: 1px solid transparent; text-align: left; transition: background .15s, color .15s;
        }
        .vg-nav-item:hover { background: var(--vg-surface-raised); color: var(--vg-text); }
        .vg-nav-item.is-active { background: var(--vg-surface-raised); color: var(--vg-amber); border-color: var(--vg-line); }
        .vg-sidebar-footer { display: flex; flex-direction: column; gap: 10px; }
        .vg-live-chip {
          display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--vg-text-muted);
          font-family: var(--font-mono); padding: 4px 6px;
        }
        .vg-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vg-teal); box-shadow: 0 0 0 0 rgba(87,199,180,0.6); animation: vgpulse 2s infinite; }
        @keyframes vgpulse { 0% { box-shadow: 0 0 0 0 rgba(87,199,180,0.55); } 70% { box-shadow: 0 0 0 6px rgba(87,199,180,0); } 100% { box-shadow: 0 0 0 0 rgba(87,199,180,0); } }
        .vg-admin-chip { display: flex; align-items: center; gap: 9px; padding: 9px; border-radius: 12px; border: 1px solid var(--vg-line); background: var(--vg-surface-raised); }
        .vg-admin-name { font-size: 12.5px; font-weight: 600; }
        .vg-admin-role { font-size: 10.5px; color: var(--vg-text-muted); }
        .vg-admin-gear { margin-left: auto; color: var(--vg-text-muted); }
        .vg-mobile-menu { display: none; }

        /* ---------- Main / Topbar ---------- */
        .vg-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .vg-topbar {
          display: flex; align-items: center; gap: 16px; justify-content: space-between;
          padding: 24px 32px; border-bottom: 1px solid var(--vg-line); flex-wrap: wrap;
        }
        .vg-page-title { font-family: var(--font-display); font-size: 27px; font-weight: 600; }
        .vg-page-subtitle { font-size: 13px; color: var(--vg-text-muted); margin-top: 4px; }
        .vg-content { padding: 26px 32px 60px; }

        /* ---------- Buttons ---------- */
        .vg-btn {
          font-weight: 600; font-size: 13.5px; padding: 10px 16px; border-radius: 10px;
          border: 1px solid var(--vg-line); background: var(--vg-surface-raised); color: var(--vg-text);
          cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: transform .08s, border-color .15s, background .15s;
          white-space: nowrap;
        }
        .vg-btn:hover { border-color: var(--vg-amber); }
        .vg-btn:active { transform: scale(0.97); }
        .vg-btn:focus-visible { outline: 2px solid var(--vg-teal); outline-offset: 2px; }
        .vg-btn--primary { background: var(--vg-amber); border-color: var(--vg-amber); color: #1A1420; }
        .vg-btn--primary:hover { background: #eeb472; border-color: #eeb472; }
        .vg-btn--ghost { background: transparent; border-color: transparent; }
        .vg-btn--ghost:hover { background: var(--vg-surface-raised); border-color: var(--vg-line); }
        .vg-btn--danger { color: var(--vg-danger); }
        .vg-btn--danger.vg-btn--solid { background: var(--vg-danger); border-color: var(--vg-danger); color: #1A1420; }
        .vg-icon-btn { padding: 8px; border-radius: 8px; }
        .vg-icon-btn--danger:hover { border-color: var(--vg-danger); color: var(--vg-danger); background: rgba(226,104,90,0.1); }

        /* ---------- Stat cards ---------- */
        .vg-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 26px; }
        .vg-stat-grid--3 { grid-template-columns: repeat(3, 1fr); }
        .vg-stat-card { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 16px 18px; }
        .vg-stat-top { display: flex; align-items: center; justify-content: space-between; }
        .vg-stat-label { font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: var(--vg-text-muted); }
        .vg-stat-value { font-family: var(--font-display); font-size: 30px; margin-top: 8px; }

        /* ---------- Dashboard grid ---------- */
        .vg-dash-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; align-items: start; }
        .vg-panel { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 18px 20px; }
        .vg-panel-title { font-family: var(--font-display); font-size: 17px; font-weight: 600; margin-bottom: 12px; }
        .vg-panel-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .vg-panel-title-row .vg-panel-title { margin-bottom: 0; }

        .vg-live-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
        .vg-live-item { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-radius: 10px; }
        .vg-live-item:hover { background: var(--vg-surface-raised); }
        .vg-live-info { flex: 1; min-width: 0; }
        .vg-live-name { font-size: 13.5px; font-weight: 600; }
        .vg-live-song { font-size: 12px; color: var(--vg-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .vg-chart-tooltip { background: var(--vg-surface-raised); border: 1px solid var(--vg-line); border-radius: 8px; padding: 8px 12px; }
        .vg-chart-tooltip-title { font-size: 12.5px; font-weight: 600; }
        .vg-chart-tooltip-value { font-family: var(--font-mono); font-size: 11.5px; color: var(--vg-amber); margin-top: 2px; }

        /* ---------- Toolbar ---------- */
        .vg-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .vg-search {
          display: flex; align-items: center; gap: 8px; background: var(--vg-surface); border: 1px solid var(--vg-line);
          border-radius: 10px; padding: 9px 12px; color: var(--vg-text-muted); min-width: 220px; flex: 1; max-width: 320px;
        }
        .vg-search input { background: transparent; border: none; outline: none; color: var(--vg-text); font-size: 13.5px; width: 100%; }
        .vg-search:focus-within { border-color: var(--vg-teal); }
        .vg-spacer { flex: 1; }
        .vg-pill {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 99px;
          border: 1px solid var(--vg-line); background: var(--vg-surface); color: var(--vg-text-muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .vg-pill.is-active { background: rgba(87,199,180,0.14); border-color: var(--vg-teal); color: var(--vg-teal); }

        /* ---------- Select ---------- */
        .vg-select-wrap { position: relative; display: inline-flex; align-items: center; }
        .vg-select-wrap--toolbar { min-width: 160px; }
        .vg-select {
          appearance: none; -webkit-appearance: none; width: 100%; background: var(--vg-surface); border: 1px solid var(--vg-line);
          border-radius: 10px; padding: 9px 32px 9px 12px; color: var(--vg-text); font-size: 13.5px; cursor: pointer;
        }
        .vg-select:focus { outline: 2px solid var(--vg-teal); outline-offset: 1px; }
        .vg-select-caret { position: absolute; right: 10px; pointer-events: none; color: var(--vg-text-muted); }

        /* ---------- Table ---------- */
        .vg-table-wrap { background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; overflow: hidden; overflow-x: auto; }
        .vg-table { width: 100%; border-collapse: collapse; min-width: 640px; }
        .vg-table th {
          text-align: left; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em;
          color: var(--vg-text-muted); padding: 13px 18px; border-bottom: 1px solid var(--vg-line); white-space: nowrap;
        }
        .vg-th-sortable { cursor: pointer; user-select: none; }
        .vg-th-sortable:hover { color: var(--vg-text); }
        .vg-table td { padding: 11px 18px; border-bottom: 1px solid var(--vg-line); font-size: 13.5px; vertical-align: middle; }
        .vg-table tr:last-child td { border-bottom: none; }
        .vg-table tr:hover td { background: rgba(227,160,83,0.035); }
        .vg-cell-title { font-weight: 600; font-size: 13.5px; }
        .vg-cell-sub { font-size: 12px; color: var(--vg-text-muted); }
        .vg-mono { font-family: var(--font-mono); font-size: 12.5px; }
        .vg-row-actions { display: flex; gap: 4px; }
        .vg-user-cell { display: flex; align-items: center; gap: 10px; }
        .vg-nowplaying { display: flex; align-items: center; gap: 7px; }

        /* ---------- Empty state ---------- */
        .vg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 20px; color: var(--vg-text-muted); }
        .vg-empty-title { font-family: var(--font-display); font-size: 16px; color: var(--vg-text); margin-top: 10px; }
        .vg-empty-message { font-size: 12.5px; margin-top: 4px; max-width: 280px; }

        /* ---------- Avatar / badge / waveform ---------- */
        .vg-avatar {
          border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700;
          font-family: var(--font-mono); flex-shrink: 0;
        }
        .vg-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 99px; font-size: 10.5px; font-weight: 700; font-family: var(--font-mono); letter-spacing: .03em; }
        .vg-badge--new { background: rgba(87,199,180,0.15); color: var(--vg-teal); }
        .vg-badge--offline { background: rgba(169,151,172,0.12); color: var(--vg-text-muted); }
        .vg-album-badge { position: absolute; top: 10px; right: 10px; }

        .vg-wave { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; }
        .vg-wave__bar { width: 2.5px; background: var(--vg-teal); border-radius: 2px; height: 30%; }
        .vg-wave.is-active .vg-wave__bar { animation: vgwave 0.9s ease-in-out infinite; }
        @keyframes vgwave { 0%, 100% { height: 22%; } 50% { height: 100%; } }
        .vg-wave--sm { height: 12px; }
        .vg-wave--sm .vg-wave__bar { width: 2px; }

        /* ---------- Covers ---------- */
        .vg-cover-thumb { object-fit: cover; }
        .vg-cover-placeholder {
          display: inline-flex; align-items: center; justify-content: center; background: var(--vg-surface-raised);
          color: var(--vg-text-faint); border: 1px solid var(--vg-line);
        }

        /* ---------- Albums page ---------- */
        .vg-album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 16px; }
        .vg-album-add {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
          border: 1px dashed var(--vg-line); border-radius: 14px; background: transparent; color: var(--vg-text-muted);
          min-height: 190px; cursor: pointer; font-size: 13px; font-weight: 600;
        }
        .vg-album-add:hover { border-color: var(--vg-amber); color: var(--vg-amber); }
        .vg-album-card { position: relative; background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 14px; padding: 14px; }
        .vg-album-cover {
          width: 100%; aspect-ratio: 1; border-radius: 10px; background: linear-gradient(155deg, var(--vg-surface-raised), var(--vg-ink));
          display: flex; align-items: center; justify-content: center; color: var(--vg-text-faint); overflow: hidden; margin-bottom: 10px;
        }
        .vg-album-cover img { width: 100%; height: 100%; object-fit: cover; }
        .vg-album-title { font-weight: 600; font-size: 14px; }
        .vg-album-meta { font-size: 11.5px; color: var(--vg-text-muted); margin-top: 2px; font-family: var(--font-mono); }
        .vg-album-delete { position: absolute; top: 10px; right: 10px; background: rgba(26,20,32,0.6); }

        /* ---------- Overlay / Modal ---------- */
        .vg-overlay {
          position: fixed; inset: 0; background: rgba(10,7,13,0.62); backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px;
        }
        .vg-modal {
          background: var(--vg-surface-raised); border: 1px solid var(--vg-line); border-radius: 16px;
          width: 100%; max-width: 480px; max-height: 88vh; overflow-y: auto; padding: 22px;
          animation: vgpop .15s ease-out;
        }
        .vg-modal--sm { max-width: 380px; }
        @keyframes vgpop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        .vg-modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .vg-modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 600; }
        .vg-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
        .vg-confirm-icon {
          width: 38px; height: 38px; border-radius: 10px; background: rgba(226,104,90,0.14); color: var(--vg-danger);
          display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
        }
        .vg-confirm-message { font-size: 13.5px; color: var(--vg-text-muted); margin: 8px 0 0; line-height: 1.5; }

        /* ---------- Form fields ---------- */
        .vg-field { margin-bottom: 15px; display: flex; flex-direction: column; gap: 6px; }
        .vg-field-row { display: flex; gap: 12px; margin-bottom: 4px; }
        .vg-label { font-size: 12px; font-weight: 600; color: var(--vg-text-muted); }
        .vg-label-optional { font-weight: 400; color: var(--vg-text-faint); }
        .vg-input {
          background: var(--vg-ink); border: 1px solid var(--vg-line); border-radius: 9px; padding: 10px 12px;
          color: var(--vg-text); font-size: 13.5px;
        }
        .vg-input:focus { outline: 2px solid var(--vg-teal); outline-offset: 1px; border-color: var(--vg-teal); }
        .vg-error { font-size: 11.5px; color: var(--vg-danger); }
        .vg-hint { font-size: 11.5px; color: var(--vg-text-faint); }
        .vg-file-drop {
          border: 1px dashed var(--vg-line); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 9px;
          cursor: pointer; font-size: 12.5px; color: var(--vg-text-muted); background: var(--vg-ink);
        }
        .vg-file-drop:hover { border-color: var(--vg-amber); color: var(--vg-text); }
        .vg-file-drop--square { width: 68px; height: 68px; padding: 0; justify-content: center; flex-shrink: 0; overflow: hidden; }
        .vg-file-drop-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vg-file-drop-meta { color: var(--vg-text-faint); }
        .vg-cover-preview { width: 100%; height: 100%; object-fit: cover; }
        .vg-mp3-preview { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: var(--vg-teal); margin-top: 6px; }
        .vg-video-preview { width: 100%; max-height: 120px; border-radius: 9px; margin-top: 8px; object-fit: cover; background: #000; }


        /* ---------- Login screen ---------- */
        .vg-login-screen { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .vg-login-card { width: 100%; max-width: 360px; background: var(--vg-surface); border: 1px solid var(--vg-line); border-radius: 16px; padding: 28px; }
        .vg-login-copy { font-size: 13px; color: var(--vg-text-muted); margin: 10px 0 18px; line-height: 1.5; }

        /* ---------- Banners / toast ---------- */
        .vg-banner {
          display: flex; align-items: flex-start; gap: 10px; background: rgba(226,104,90,0.1); border: 1px solid var(--vg-danger);
          color: var(--vg-danger); padding: 12px 16px; border-radius: 10px; margin-bottom: 18px; font-size: 12.5px; line-height: 1.5;
        }
        .vg-banner-text { flex: 1; }
        .vg-banner-retry { flex-shrink: 0; }
        .vg-toast {
          position: fixed; bottom: 20px; right: 20px; background: var(--vg-surface-raised); border: 1px solid var(--vg-line);
          padding: 12px 16px; border-radius: 10px; font-size: 13px; z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.35); max-width: 320px;
        }
        .vg-toast--error { border-color: var(--vg-danger); color: var(--vg-danger); }
        .vg-toast--success { border-color: var(--vg-teal); color: var(--vg-teal); }
        .vg-loading-screen { min-height: 100vh; width: 100%; display: flex; align-items: center; justify-content: center; color: var(--vg-text-muted); font-family: var(--font-mono); font-size: 12.5px; gap: 8px; }
        .vg-refresh-btn.is-spinning svg { animation: vgspin 0.8s linear infinite; }
        @keyframes vgspin { to { transform: rotate(360deg); } }
        .vg-topbar-title-row { display: flex; align-items: center; gap: 8px; }
        .vg-caveat { font-size: 11.5px; color: var(--vg-text-faint); margin-top: 2px; }

        /* ---------- Responsive ---------- */
        @media (max-width: 880px) {
          .vg-dash-grid { grid-template-columns: 1fr; }
          .vg-stat-grid, .vg-stat-grid--3 { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 720px) {
          .vg-sidebar {
            position: fixed; z-index: 70; left: 0; top: 0; transform: translateX(-100%);
            transition: transform .2s ease; box-shadow: 20px 0 40px rgba(0,0,0,0.4);
          }
          .vg-sidebar.is-open { transform: translateX(0); }
          .vg-mobile-menu {
            display: flex; flex-direction: column; gap: 3px; justify-content: center; width: 32px; height: 32px;
            background: transparent; border: none; cursor: pointer; padding: 6px;
          }
          .vg-mobile-menu span { display: block; height: 2px; background: var(--vg-text); border-radius: 2px; }
          .vg-topbar { padding: 18px 16px; }
          .vg-content { padding: 18px 16px 50px; }
          .vg-stat-grid, .vg-stat-grid--3 { grid-template-columns: 1fr 1fr; gap: 10px; }
          .vg-stat-value { font-size: 24px; }
          .vg-field-row { flex-direction: column; }
        }
      `}</style>

      <Sidebar
        active={activeTab}
        onChange={(t) => { setActiveTab(t); setMobileMenuOpen(false); }}
        activeListeners={activeListeners}
        mobileOpen={mobileMenuOpen}
        auth={auth}
        onSignOut={() => { setAuth({ token: null, user: null }); setSkippedLogin(false); }}
      />

      <div className="vg-main">
        <Topbar {...topbarProps} onMobileMenu={() => setMobileMenuOpen((v) => !v)} onRefresh={() => loadAll(true)} refreshing={refreshing} />
        <div className="vg-content">
          {loadError && (
            <div className="vg-banner">
              <AlertTriangle size={16} />
              <div className="vg-banner-text">
                Couldn't load data from Supabase: {loadError}. This usually means Row Level Security is blocking access —
                check <code>supabase-setup.sql</code> for the policies this panel expects.
              </div>
              <button className="vg-btn vg-btn--ghost vg-banner-retry" onClick={() => loadAll(false)}>Retry</button>
            </div>
          )}

          {loading ? (
            <div className="vg-loading-screen"><RefreshCw size={14} className="is-spinning" /> Loading your catalogue…</div>
          ) : (
            <>
              {activeTab === 'dashboard' && <DashboardPage songs={songs} profiles={profiles} nowPlayingByUser={nowPlayingByUser} />}
              {activeTab === 'songs' && (
                <SongsPage songs={songs} albumNames={albumNames} onAdd={openAddSong} onEdit={openEditSong} onDelete={requestDeleteSong} />
              )}
              {activeTab === 'albums' && <AlbumsPage songs={songs} />}
              {activeTab === 'users' && <UsersPage profiles={profiles} nowPlayingByUser={nowPlayingByUser} />}
            </>
          )}
        </div>
      </div>

      {songModal.open && (
        <SongModal
          mode={songModal.mode}
          initialData={songModal.data}
          albumNames={albumNames}
          token={auth.token}
          userId={auth.user?.id}
          onClose={closeSongModal}
          onSaved={handleSongSaved}
        />
      )}
      {confirm && <ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      {toast && <div className={`vg-toast vg-toast--${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}

/* =========================================================================
   NOTE ON THE SUPABASE CONNECTION
   This panel talks to Supabase directly over its REST, Storage, and Auth
   HTTP APIs (no @supabase/supabase-js — that package isn't available inside
   this preview sandbox). That's why sign-in doesn't persist across a page
   refresh: this sandbox also disallows localStorage/sessionStorage, so the
   session lives only in memory. When you move this into a real project
   (e.g. with Claude Code), swap these fetch helpers for the official
   supabase-js client — you'll get persistent sessions, refresh tokens, and
   true realtime subscriptions (push updates instead of the 20s polling
   used here) with very little code change, since the REST shapes match.
   ========================================================================= */
