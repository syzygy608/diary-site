import { Elysia, t } from 'elysia'
import { mkdir, readdir, readFile, writeFile, unlink, access } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

const root = import.meta.dir
const entriesDir = path.join(root, 'entries')
const isProd = process.argv.includes('--prod')
const hostname = process.env.HOST || '127.0.0.1'
const port = Number(process.env.PORT || (isProd ? 4173 : 3001))

const safeSlug = (value = '') => String(value)
  .replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 90)
const toSlug = (title: string, date: string) => `${date}-${safeSlug(title) || 'diary'}`
const entryPath = (slug: string) => path.join(entriesDir, `${safeSlug(slug)}.md`)

const entryBody = t.Object({
  title: t.String({ maxLength: 100 }),
  date: t.String(),
  mood: t.String({ maxLength: 20 }),
  tags: t.Array(t.String({ maxLength: 30 }), { maxItems: 12 }),
  content: t.String({ maxLength: 2_000_000 }),
})

async function ensureEntries() {
  await mkdir(entriesDir, { recursive: true })
}

async function readEntry(filename: string) {
  const raw = await readFile(path.join(entriesDir, filename), 'utf8')
  const parsed = matter(raw)
  return {
    slug: filename.replace(/\.md$/, ''),
    title: parsed.data.title || '未命名日記',
    date: parsed.data.date || filename.slice(0, 10),
    mood: parsed.data.mood || '平靜',
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
    updatedAt: parsed.data.updatedAt || parsed.data.date,
    content: parsed.content.trim(),
  }
}

async function saveEntry(slug: string, input: typeof entryBody.static) {
  const data = {
    title: String(input.title || '未命名日記').trim(),
    date: String(input.date || new Date().toISOString().slice(0, 10)),
    mood: String(input.mood || '平靜'),
    tags: input.tags.map(String).filter(Boolean).slice(0, 12),
    updatedAt: new Date().toISOString(),
  }
  const markdown = matter.stringify(`${String(input.content || '').trim()}\n`, data)
  await writeFile(entryPath(slug), markdown, 'utf8')
  return readEntry(`${slug}.md`)
}

const app = new Elysia()
  .onError(({ code, error, set }) => {
    console.error(error)
    if (code === 'VALIDATION') {
      set.status = 422
      return { message: '日記內容格式不正確，請檢查後再試。' }
    }
    set.status = 500
    return { message: '本機日記服務暫時無法完成操作。' }
  })
  .get('/api/entries', async () => {
    await ensureEntries()
    const files = (await readdir(entriesDir)).filter((name) => name.endsWith('.md'))
    const entries = await Promise.all(files.map(readEntry))
    return entries.sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`))
  })
  .post('/api/entries', async ({ body, set }) => {
    await ensureEntries()
    let slug = toSlug(body.title, body.date)
    let suffix = 2
    while (await access(entryPath(slug)).then(() => true).catch(() => false)) {
      slug = `${toSlug(body.title, body.date)}-${suffix++}`
    }
    set.status = 201
    return saveEntry(slug, body)
  }, { body: entryBody })
  .put('/api/entries/:slug', async ({ params, body, set }) => {
    const slug = safeSlug(params.slug)
    const exists = await access(entryPath(slug)).then(() => true).catch(() => false)
    if (!exists) {
      set.status = 404
      return { message: '找不到這篇日記。' }
    }
    return saveEntry(slug, body)
  }, { body: entryBody })
  .delete('/api/entries/:slug', async ({ params, set }) => {
    const slug = safeSlug(params.slug)
    const exists = await access(entryPath(slug)).then(() => true).catch(() => false)
    if (!exists) {
      set.status = 404
      return { message: '找不到這篇日記。' }
    }
    await unlink(entryPath(slug))
    set.status = 204
  })

if (isProd) {
  app.get('/*', async ({ params, set }) => {
    const requested = params['*'] || ''
    const filePath = requested && !requested.includes('..')
      ? path.join(root, 'dist', requested)
      : path.join(root, 'dist', 'index.html')
    const file = Bun.file(filePath)
    if (await file.exists()) return file
    set.headers['Content-Type'] = 'text/html; charset=utf-8'
    return Bun.file(path.join(root, 'dist', 'index.html'))
  })
}

app.listen({ hostname, port })
console.log(`墨記已啟動：http://${hostname}:${port}`)
