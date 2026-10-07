<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import {
  Archive, BookOpenText, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Feather, FileText, Hash, Menu, Moon, MoreHorizontal, Plus, Search,
  Sparkles, Sun, Tag, Trash2, X
} from 'lucide-vue-next'

const md = new MarkdownIt({ html: false, breaks: true, linkify: true, typographer: true })
const entries = ref([])
const active = ref(null)
const mode = ref('read')
const query = ref('')
const activeTag = ref('全部')
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const sidebarOpen = ref(false)
const confirmDelete = ref(false)
const tagInput = ref('')
const tagPickerOpen = ref(false)
const highlightedTag = ref(0)
const dark = ref(localStorage.getItem('moji-theme') === 'dark')
let noticeTimer
let webMcpLifecycle

const emptyDraft = () => ({
  slug: null,
  title: '',
  date: new Date().toISOString().slice(0, 10),
  mood: '平靜',
  tags: [],
  content: '',
})
const draft = reactive(emptyDraft())

const allTags = computed(() => [...new Set(entries.value.flatMap((entry) => entry.tags))].sort())
const normalizedTagInput = computed(() => tagInput.value.trim().replace(/^#/, ''))
const tagUsage = computed(() => entries.value.reduce((counts, entry) => {
  entry.tags.forEach((tagName) => counts.set(tagName, (counts.get(tagName) || 0) + 1))
  return counts
}, new Map()))
const availableTags = computed(() => {
  const needle = normalizedTagInput.value.toLocaleLowerCase('zh-TW')
  return allTags.value
    .filter((tagName) => !draft.tags.includes(tagName) && (!needle || tagName.toLocaleLowerCase('zh-TW').includes(needle)))
    .sort((a, b) => (tagUsage.value.get(b) || 0) - (tagUsage.value.get(a) || 0) || a.localeCompare(b, 'zh-TW'))
    .slice(0, 8)
})
const canCreateTag = computed(() => normalizedTagInput.value
  && !allTags.value.some((tagName) => tagName.toLocaleLowerCase('zh-TW') === normalizedTagInput.value.toLocaleLowerCase('zh-TW'))
  && !draft.tags.some((tagName) => tagName.toLocaleLowerCase('zh-TW') === normalizedTagInput.value.toLocaleLowerCase('zh-TW')))
const filtered = computed(() => entries.value.filter((entry) => {
  const needle = query.value.trim().toLowerCase()
  const matchesQuery = !needle || `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase().includes(needle)
  return matchesQuery && (activeTag.value === '全部' || entry.tags.includes(activeTag.value))
}))
const groupedEntries = computed(() => {
  const groups = {}
  filtered.value.forEach((entry) => {
    const month = entry.date.slice(0, 7)
    ;(groups[month] ||= []).push(entry)
  })
  return groups
})
const rendered = computed(() => md.render((mode.value === 'edit' ? draft.content : active.value?.content) || ''))
const wordCount = computed(() => (draft.content.match(/[\u4e00-\u9fff]|[a-zA-Z0-9]+/g) || []).length)
const readMinutes = computed(() => Math.max(1, Math.ceil(wordCount.value / 300)))
const hasChanges = computed(() => {
  if (!active.value) return Boolean(draft.title || draft.content)
  return ['title', 'date', 'mood', 'content'].some((key) => draft[key] !== active.value[key]) || JSON.stringify(draft.tags) !== JSON.stringify(active.value.tags)
})

const monthLabel = (value) => new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(new Date(`${value}-02`))
const dayLabel = (value) => new Intl.DateTimeFormat('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`))
const fullDate = (value) => new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${value}T12:00:00`))

function flash(message) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = ''), 2400)
}

async function loadEntries() {
  try {
    const response = await fetch('/api/entries')
    if (!response.ok) throw new Error()
    entries.value = await response.json()
    if (entries.value.length) selectEntry(entries.value[0])
    else newEntry()
  } catch {
    flash('暫時讀不到日記，請確認本機服務仍在運作')
  } finally {
    loading.value = false
  }
}

function syncDraft(entry) {
  Object.assign(draft, JSON.parse(JSON.stringify(entry || emptyDraft())))
}

function selectEntry(entry) {
  active.value = entry
  syncDraft(entry)
  mode.value = 'read'
  sidebarOpen.value = false
}

function newEntry() {
  active.value = null
  syncDraft(emptyDraft())
  const saved = localStorage.getItem('moji-draft')
  if (saved) Object.assign(draft, JSON.parse(saved))
  mode.value = 'edit'
  sidebarOpen.value = false
  setTimeout(() => document.querySelector('#title-input')?.focus(), 80)
}

function editEntry() {
  syncDraft(active.value)
  mode.value = 'edit'
  setTimeout(() => document.querySelector('#editor')?.focus(), 80)
}

function cancelEdit() {
  if (active.value) {
    syncDraft(active.value)
    mode.value = 'read'
  } else if (!hasChanges.value || window.confirm('要放棄這份草稿嗎？')) {
    localStorage.removeItem('moji-draft')
    entries.value.length ? selectEntry(entries.value[0]) : syncDraft(emptyDraft())
  }
}

async function saveEntry() {
  if (!draft.title.trim()) return flash('先替今天留一個標題吧')
  saving.value = true
  try {
    const response = await fetch(active.value ? `/api/entries/${active.value.slug}` : '/api/entries', {
      method: active.value ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    if (!response.ok) throw new Error()
    const saved = await response.json()
    const index = entries.value.findIndex((entry) => entry.slug === saved.slug)
    if (index >= 0) entries.value.splice(index, 1, saved)
    else entries.value.unshift(saved)
    entries.value.sort((a, b) => b.date.localeCompare(a.date))
    localStorage.removeItem('moji-draft')
    selectEntry(saved)
    flash('已寫進 Markdown 檔案')
  } catch {
    flash('儲存沒有成功，內容還留在編輯器裡')
  } finally {
    saving.value = false
  }
}

async function removeEntry() {
  if (!active.value) return
  const response = await fetch(`/api/entries/${active.value.slug}`, { method: 'DELETE' })
  if (!response.ok) return flash('刪除失敗，請再試一次')
  entries.value = entries.value.filter((entry) => entry.slug !== active.value.slug)
  confirmDelete.value = false
  entries.value.length ? selectEntry(entries.value[0]) : newEntry()
  flash('日記已刪除')
}

function addTag() {
  const value = normalizedTagInput.value
  if (!value) return
  const existing = allTags.value.find((tagName) => tagName.toLocaleLowerCase('zh-TW') === value.toLocaleLowerCase('zh-TW'))
  selectTag(existing || value)
}

function selectTag(tagName) {
  if (draft.tags.length >= 12) return flash('每篇日記最多使用 12 個標籤')
  if (tagName && !draft.tags.includes(tagName)) draft.tags.push(tagName)
  tagInput.value = ''
  highlightedTag.value = 0
  tagPickerOpen.value = true
}

function handleTagKeydown(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    tagPickerOpen.value = true
    highlightedTag.value = Math.min(highlightedTag.value + 1, Math.max(availableTags.value.length - 1, 0))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlightedTag.value = Math.max(highlightedTag.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    if (tagPickerOpen.value && availableTags.value[highlightedTag.value]) selectTag(availableTags.value[highlightedTag.value])
    else addTag()
  } else if (event.key === ',') {
    event.preventDefault()
    addTag()
  } else if (event.key === 'Escape') {
    tagPickerOpen.value = false
  }
}

function closeTagPicker() {
  window.setTimeout(() => (tagPickerOpen.value = false), 120)
}

function toggleTheme() {
  dark.value = !dark.value
}

watch(dark, (value) => {
  document.documentElement.classList.toggle('dark', value)
  localStorage.setItem('moji-theme', value ? 'dark' : 'light')
}, { immediate: true })

watch(draft, (value) => {
  if (mode.value === 'edit' && !active.value) localStorage.setItem('moji-draft', JSON.stringify(value))
}, { deep: true })

watch(tagInput, () => {
  highlightedTag.value = 0
  tagPickerOpen.value = true
})

function keydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (mode.value === 'edit') saveEntry()
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    newEntry()
  }
  if (event.key === 'Escape' && sidebarOpen.value) sidebarOpen.value = false
}

function registerWebMcp() {
  const context = document.modelContext
  if (!context?.registerTool) return
  webMcpLifecycle = new AbortController()
  const options = { signal: webMcpLifecycle.signal }
  Promise.resolve(context.registerTool({
    name: 'list_diary_entries',
    title: '列出日記',
    description: '依關鍵字或標籤搜尋目前存在本機的日記，回傳標題、日期、心情與標籤。',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, tag: { type: 'string' } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input = {}) {
      const needle = String(input.query || '').toLowerCase()
      return entries.value
        .filter((entry) => (!needle || `${entry.title} ${entry.content}`.toLowerCase().includes(needle)) && (!input.tag || entry.tags.includes(input.tag)))
        .map(({ slug, title, date, mood, tags }) => ({ slug, title, date, mood, tags }))
    },
  }, options)).catch(() => {})

  Promise.resolve(context.registerTool({
    name: 'create_diary_entry',
    title: '新增日記',
    description: '新增一篇 Markdown 日記並立即顯示在墨記中。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        mood: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        content: { type: 'string' },
      },
      required: ['title', 'date', 'content'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) {
      const response = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: '平靜', tags: [], ...input }),
      })
      if (!response.ok) throw new Error('無法新增日記')
      const saved = await response.json()
      entries.value.unshift(saved)
      selectEntry(saved)
      return { slug: saved.slug, title: saved.title, saved: true }
    },
  }, options)).catch(() => {})
}

onMounted(() => {
  loadEntries()
  registerWebMcp()
  window.addEventListener('keydown', keydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown)
  webMcpLifecycle?.abort()
})
</script>

<template>
  <div class="min-h-screen bg-[var(--canvas)] text-[var(--ink)] transition-colors duration-300">
    <div class="flex min-h-screen">
      <div v-if="sidebarOpen" class="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-sm lg:hidden" @click="sidebarOpen = false" />

      <aside :class="['fixed inset-y-0 left-0 z-40 flex w-[19rem] flex-col border-r border-[var(--line)] bg-[var(--sidebar)] transition-transform duration-300 lg:static lg:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full']">
        <div class="flex h-20 items-center justify-between px-6">
          <button class="group flex items-center gap-3 text-left" @click="activeTag = '全部'; query = ''">
            <span class="grid size-10 place-items-center rounded-2xl bg-slate-900 text-orange-400 shadow-lg shadow-slate-950/10 dark:bg-orange-500 dark:text-white"><Feather :size="20" /></span>
            <span><b class="block text-lg tracking-[.18em]">墨記</b><small class="text-[.7rem] tracking-[.2em] text-[var(--muted)]">LOCAL JOURNAL</small></span>
          </button>
          <button type="button" class="icon-button grid lg:hidden" aria-label="關閉選單" @click="sidebarOpen = false"><X :size="19" /></button>
        </div>

        <div class="px-5 pb-4">
          <button class="new-button" @click="newEntry"><Plus :size="18" />寫今天的日記 <span>⌘ N</span></button>
          <label class="search-field mt-3"><Search :size="17" /><input v-model="query" type="search" placeholder="搜尋文字或標籤" /></label>
        </div>

        <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-8" aria-label="日記列表">
          <div class="mb-5 px-3">
            <p class="section-label">標籤</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button :class="['tag-filter', activeTag === '全部' && 'active']" @click="activeTag = '全部'">全部 {{ entries.length }}</button>
              <button v-for="tagName in allTags" :key="tagName" :class="['tag-filter', activeTag === tagName && 'active']" @click="activeTag = tagName">#{{ tagName }}</button>
            </div>
          </div>

          <div v-if="loading" class="space-y-3 px-2">
            <div v-for="i in 4" :key="i" class="h-20 animate-pulse rounded-2xl bg-[var(--soft)]" />
          </div>
          <div v-else-if="!filtered.length" class="empty-list"><Archive :size="23" /><p>這裡還沒有符合的日記</p></div>
          <section v-for="(monthEntries, month) in groupedEntries" :key="month" class="mb-5">
            <p class="section-label px-3">{{ monthLabel(month) }}</p>
            <button v-for="entry in monthEntries" :key="entry.slug" :class="['entry-card', active?.slug === entry.slug && 'active']" @click="selectEntry(entry)">
              <span class="entry-date"><b>{{ entry.date.slice(8, 10) }}</b><small>{{ dayLabel(entry.date).split('週')[1] ? `週${dayLabel(entry.date).split('週')[1]}` : '' }}</small></span>
              <span class="min-w-0 flex-1"><b class="block truncate font-medium">{{ entry.title }}</b><small class="mt-1 block truncate text-[var(--muted)]">{{ entry.content || '這一天沒有留下文字' }}</small></span>
              <span class="mood-dot" :title="entry.mood">{{ entry.mood.slice(0, 1) }}</span>
            </button>
          </section>
        </nav>

        <div class="border-t border-[var(--line)] px-5 py-4 text-xs text-[var(--muted)]">
          <div class="flex items-center gap-2"><Check :size="14" class="text-emerald-500" />所有日記都存在這台電腦</div>
        </div>
      </aside>

      <main class="min-w-0 flex-1">
        <header class="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-[var(--line)] bg-[color:var(--canvas-translucent)] px-4 backdrop-blur-xl sm:px-7">
          <div class="flex items-center gap-2">
            <button type="button" class="icon-button grid lg:hidden" aria-label="開啟選單" @click="sidebarOpen = true"><Menu :size="20" /></button>
            <div v-if="mode === 'read' && active" class="hidden items-center gap-2 text-sm text-[var(--muted)] sm:flex"><CalendarDays :size="16" /><span>{{ fullDate(active.date) }}</span></div>
            <div v-else class="mode-switch" role="tablist">
              <button :class="mode === 'edit' && 'active'" @click="mode = 'edit'">編輯</button>
              <button :class="mode === 'preview' && 'active'" @click="mode = 'preview'">預覽</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="icon-button grid" :aria-label="dark ? '切換亮色' : '切換深色'" @click="toggleTheme"><Sun v-if="dark" :size="18" /><Moon v-else :size="18" /></button>
            <template v-if="mode === 'read' && active">
              <button type="button" class="secondary-button hidden sm:flex" @click="editEntry"><FileText :size="16" />編輯</button>
              <button type="button" class="icon-button grid sm:hidden" aria-label="編輯" @click="editEntry"><FileText :size="18" /></button>
              <button type="button" class="icon-button danger grid" aria-label="刪除日記" @click="confirmDelete = true"><Trash2 :size="17" /></button>
            </template>
            <template v-else>
              <button class="secondary-button hidden sm:flex" @click="cancelEdit">取消</button>
              <button class="save-button" :disabled="saving" @click="saveEntry"><Check :size="17" />{{ saving ? '儲存中' : '完成' }}</button>
            </template>
          </div>
        </header>

        <div v-if="loading" class="mx-auto max-w-4xl px-6 py-16"><div class="h-10 w-2/3 animate-pulse rounded-xl bg-[var(--soft)]" /><div class="mt-10 space-y-4"><div v-for="i in 6" :key="i" class="h-4 animate-pulse rounded bg-[var(--soft)]" /></div></div>

        <article v-else-if="mode === 'read' && active" class="mx-auto max-w-[52rem] px-5 pb-24 pt-10 sm:px-10 sm:pt-16">
          <div class="mb-10">
            <div class="mb-4 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <span class="mood-pill"><Sparkles :size="14" />{{ active.mood }}</span>
              <span v-for="tagName in active.tags" :key="tagName" class="read-tag">#{{ tagName }}</span>
            </div>
            <h1 class="journal-title">{{ active.title }}</h1>
            <div class="mt-5 flex items-center gap-5 text-sm text-[var(--muted)]">
              <span class="flex items-center gap-1.5"><Clock3 :size="15" />約 {{ Math.max(1, Math.ceil((active.content.match(/[\u4e00-\u9fff]|[a-zA-Z0-9]+/g) || []).length / 300)) }} 分鐘</span>
              <span>{{ (active.content.match(/[\u4e00-\u9fff]|[a-zA-Z0-9]+/g) || []).length }} 字</span>
            </div>
          </div>
          <div class="prose-journal" v-html="rendered" />
          <div class="mt-16 flex items-center gap-4 border-t border-[var(--line)] pt-6 text-sm text-[var(--muted)]"><span class="h-px w-8 bg-orange-500" />最後修改於 {{ new Date(active.updatedAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }) }}</div>
        </article>

        <section v-else class="mx-auto max-w-[72rem] px-4 pb-24 pt-7 sm:px-7 lg:px-10">
          <div class="editor-shell">
            <div class="editor-meta">
              <input id="title-input" v-model="draft.title" class="title-input" placeholder="今天，想記下什麼？" maxlength="100" />
              <div class="mt-5 flex flex-wrap items-center gap-3">
                <label class="meta-field"><CalendarDays :size="16" /><input v-model="draft.date" type="date" /></label>
                <label class="meta-field"><Sparkles :size="16" /><select v-model="draft.mood"><option>平靜</option><option>開心</option><option>充實</option><option>期待</option><option>疲憊</option><option>低落</option><option>煩躁</option></select></label>
                <div class="tag-picker">
                  <div class="tag-editor">
                    <Tag :size="15" />
                    <span v-for="tagName in draft.tags" :key="tagName">#{{ tagName }}<button type="button" :aria-label="`移除 ${tagName}`" @click="draft.tags = draft.tags.filter((item) => item !== tagName)">×</button></span>
                    <input
                      v-model="tagInput"
                      role="combobox"
                      aria-label="搜尋或建立標籤"
                      aria-controls="tag-suggestions"
                      :aria-expanded="tagPickerOpen"
                      :aria-activedescendant="availableTags[highlightedTag] ? `tag-option-${highlightedTag}` : undefined"
                      placeholder="搜尋或新增標籤"
                      autocomplete="off"
                      @focus="tagPickerOpen = true"
                      @blur="closeTagPicker"
                      @keydown="handleTagKeydown"
                    />
                  </div>
                  <div v-if="tagPickerOpen && (availableTags.length || canCreateTag)" id="tag-suggestions" class="tag-suggestions" role="listbox">
                    <p class="tag-suggestions-label">{{ normalizedTagInput ? '符合的標籤' : '常用標籤' }}</p>
                    <button
                      v-for="(tagName, index) in availableTags"
                      :id="`tag-option-${index}`"
                      :key="tagName"
                      type="button"
                      role="option"
                      :aria-selected="highlightedTag === index"
                      :class="['tag-suggestion', highlightedTag === index && 'active']"
                      @mousemove="highlightedTag = index"
                      @mousedown.prevent="selectTag(tagName)"
                    >
                      <Hash :size="14" />
                      <span>{{ tagName }}</span>
                      <small>{{ tagUsage.get(tagName) }} 篇</small>
                    </button>
                    <button v-if="canCreateTag && !availableTags.length" type="button" class="tag-suggestion create" @mousedown.prevent="addTag">
                      <Plus :size="14" />
                      <span>建立「{{ normalizedTagInput }}」</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="mode === 'edit'" class="relative">
              <textarea id="editor" v-model="draft.content" class="markdown-editor" spellcheck="true" placeholder="# 寫下這一天\n\n可以使用 **粗體**、清單、引用與其他 Markdown 格式。" />
              <div class="editor-status"><span>支援 Markdown</span><span>{{ wordCount }} 字 · 約 {{ readMinutes }} 分鐘</span></div>
            </div>
            <div v-else class="min-h-[38rem] px-6 py-8 sm:px-12 sm:py-12">
              <div v-if="draft.content" class="prose-journal" v-html="rendered" />
              <div v-else class="preview-empty"><BookOpenText :size="36" /><p>開始書寫後，預覽會出現在這裡</p></div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <Transition name="toast"><div v-if="notice" class="toast"><Check :size="17" />{{ notice }}</div></Transition>

    <div v-if="confirmDelete" class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5 backdrop-blur-sm" @click.self="confirmDelete = false">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <span class="grid size-11 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10"><Trash2 :size="20" /></span>
        <h2 id="delete-title" class="mt-5 text-xl font-semibold">刪除這篇日記？</h2>
        <p class="mt-2 leading-7 text-[var(--muted)]">「{{ active?.title }}」的 Markdown 檔會從本機移除，這個動作無法復原。</p>
        <div class="mt-7 flex justify-end gap-3"><button class="secondary-button" @click="confirmDelete = false">保留</button><button class="delete-button" @click="removeEntry">刪除</button></div>
      </div>
    </div>
  </div>
</template>
